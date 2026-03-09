// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Interface — only the two functions the pool needs from ScoreNFTv3
// ─────────────────────────────────────────────────────────────────────────────

interface IScoreNFT {
    function getScore(address wallet) external view returns (
        uint16  score,
        uint64  issuedAt,
        uint64  expiresAt,
        bytes32 dataHash,
        bool    isValid,
        bool    exists
    );
}

// ─────────────────────────────────────────────────────────────────────────────
/// @title  VeraLendingPool
/// @notice Score-gated, over-collateralised PAS lending pool.
///         Borrowers deposit PAS as collateral and borrow PAS from the pool's
///         reserve, subject to their VeraScore NFT being valid and above 250.
///
/// Tiers (score → LTV / liquidation threshold / APR):
///   ≥ 750  Excellent  90 % LTV · 95 % liq · 5 %  APR
///   ≥ 500  Good       75 % LTV · 80 % liq · 8 %  APR
///   ≥ 250  Fair       60 % LTV · 65 % liq · 12 % APR
///   < 250             denied
///
/// Interest model: simple (non-compound) linear accrual per second.
/// Liquidation: any caller repays full debt, receives collateral + 5 % bonus.
/// ─────────────────────────────────────────────────────────────────────────────
contract VeraLendingPool is Ownable, ReentrancyGuard, Pausable {

    // ── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant BASIS          = 10_000;        // 100.00 %
    uint256 public constant SECS_PER_YEAR  = 365 days;
    uint256 public constant LIQ_BONUS_BPS  = 500;           // 5 % bonus to liquidator
    uint256 public constant MIN_COLLATERAL = 0.001 ether;   // minimum deposit
    uint256 public constant MIN_BORROW     = 0.0001 ether;  // minimum borrow

    // ── Tier config ───────────────────────────────────────────────────────────

    struct Tier {
        uint16 scoreMin;      // inclusive lower bound
        uint16 ltvBps;        // max borrow / collateral, e.g. 9000 = 90 %
        uint16 liqThreshBps;  // liquidation threshold, e.g. 9500 = 95 %
        uint16 aprBps;        // annual interest rate, e.g. 500 = 5 %
    }

    // Ordered best → worst; _tierForScore() iterates from index 0
    Tier[3] private _tiers;

    // ── Per-borrower position ─────────────────────────────────────────────────

    struct Position {
        uint128 collateral;       // PAS deposited (wei)
        uint128 principal;        // outstanding principal (wei)
        uint128 accruedInterest;  // interest accumulated up to lastAccrual
        uint64  lastAccrual;      // timestamp of last interest checkpoint
        uint16  scoreTierIdx;     // 0/1/2 — tier index locked at last borrow
        bool    active;           // true once deposit() is first called
    }

    mapping(address => Position) private _positions;

    // ── Pool accounting ───────────────────────────────────────────────────────

    uint256 public totalCollateral;  // sum of all deposited collateral
    uint256 public totalBorrowed;    // sum of all outstanding principal

    // ── External dependency ───────────────────────────────────────────────────

    IScoreNFT public immutable scoreNFT;

    // ── Events ────────────────────────────────────────────────────────────────

    event Deposited(
        address indexed borrower,
        uint256         amount,
        uint256         totalCollateral
    );
    event Borrowed(
        address indexed borrower,
        uint256         amount,
        uint16          score,
        uint16          ltvBps
    );
    event Repaid(
        address indexed borrower,
        uint256         principalPaid,
        uint256         interestPaid,
        uint256         remainingDebt
    );
    event Withdrawn(
        address indexed borrower,
        uint256         amount,
        uint256         remainingCollateral
    );
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256         collateralSeized,
        uint256         bonusPaid,
        uint256         debtCleared
    );
    event PoolFunded(address indexed funder, uint256 amount);
    event PoolWithdrawn(uint256 amount);

    // ── Errors ────────────────────────────────────────────────────────────────

    error NoValidScore();
    error ScoreTooLow(uint16 score);
    error ExceedsLTV(uint256 newDebt, uint256 maxDebt);
    error InsufficientLiquidity(uint256 requested, uint256 available);
    error InsufficientWithdrawable(uint256 requested, uint256 available);
    error PositionHealthy();
    error NothingToRepay();
    error AmountTooSmall(uint256 minimum);
    error NoActivePosition();
    error TransferFailed();

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(address scoreNFT_) Ownable(msg.sender) {
        scoreNFT = IScoreNFT(scoreNFT_);

        // index 0 — Excellent (≥750)
        _tiers[0] = Tier({ scoreMin: 750, ltvBps: 9000, liqThreshBps: 9500, aprBps:  500 });
        // index 1 — Good (≥500)
        _tiers[1] = Tier({ scoreMin: 500, ltvBps: 7500, liqThreshBps: 8000, aprBps:  800 });
        // index 2 — Fair (≥250)
        _tiers[2] = Tier({ scoreMin: 250, ltvBps: 6000, liqThreshBps: 6500, aprBps: 1200 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pool liquidity management (owner only)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Seed the pool with PAS so borrowers have funds to draw from.
    function fundPool() external payable onlyOwner {
        emit PoolFunded(msg.sender, msg.value);
    }

    /// @notice Reclaim idle pool funds (only the portion not backing any loans).
    function withdrawPoolFunds(uint256 amount) external onlyOwner nonReentrant {
        uint256 idle = poolLiquidity();
        require(amount <= idle, "Exceeds idle liquidity");
        _send(msg.sender, amount);
        emit PoolWithdrawn(amount);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // User actions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Deposit PAS collateral. Can be called multiple times to top up.
    function deposit() external payable nonReentrant whenNotPaused {
        if (msg.value < MIN_COLLATERAL) revert AmountTooSmall(MIN_COLLATERAL);

        Position storage pos = _positions[msg.sender];
        _accrueInterest(pos);

        pos.collateral    += uint128(msg.value);
        pos.active         = true;
        totalCollateral   += msg.value;

        emit Deposited(msg.sender, msg.value, pos.collateral);
    }

    /// @notice Borrow PAS against deposited collateral.
    ///         Score must be valid and ≥ 250.  LTV limit is score-gated.
    /// @param  amount  PAS to borrow (wei).
    function borrow(uint256 amount) external nonReentrant whenNotPaused {
        if (amount < MIN_BORROW) revert AmountTooSmall(MIN_BORROW);

        // ── Score check ───────────────────────────────────────────────────────
        (uint16 score, , , , bool isValid, bool exists) = scoreNFT.getScore(msg.sender);
        if (!exists || !isValid) revert NoValidScore();

        uint256 tierIdx = _tierIdxForScore(score);
        if (tierIdx > 2) revert ScoreTooLow(score); // score < 250

        Tier storage tier = _tiers[tierIdx];

        // ── Position must exist ───────────────────────────────────────────────
        Position storage pos = _positions[msg.sender];
        if (!pos.active) revert NoActivePosition();
        _accrueInterest(pos);

        // ── LTV cap check ─────────────────────────────────────────────────────
        uint256 currentDebt = uint256(pos.principal) + uint256(pos.accruedInterest);
        uint256 newDebt     = currentDebt + amount;
        uint256 maxDebt     = (uint256(pos.collateral) * tier.ltvBps) / BASIS;
        if (newDebt > maxDebt) revert ExceedsLTV(newDebt, maxDebt);

        // ── Pool liquidity check ──────────────────────────────────────────────
        uint256 idle = poolLiquidity();
        if (amount > idle) revert InsufficientLiquidity(amount, idle);

        // ── State update ──────────────────────────────────────────────────────
        pos.principal    += uint128(amount);
        pos.scoreTierIdx  = uint16(tierIdx);
        totalBorrowed    += amount;

        _send(msg.sender, amount);

        emit Borrowed(msg.sender, amount, score, tier.ltvBps);
    }

    /// @notice Repay outstanding debt (principal + accrued interest).
    ///         Send the exact amount or more — excess is returned.
    function repay() external payable nonReentrant {
        Position storage pos = _positions[msg.sender];
        if (!pos.active) revert NoActivePosition();

        _accrueInterest(pos);

        uint256 totalDebt = uint256(pos.principal) + uint256(pos.accruedInterest);
        if (totalDebt == 0) revert NothingToRepay();

        uint256 payment    = msg.value;
        uint256 paid       = payment > totalDebt ? totalDebt : payment;
        uint256 excess     = payment - paid;

        // Interest settled before principal
        uint256 interestPaid;
        uint256 principalPaid;

        if (paid >= pos.accruedInterest) {
            interestPaid  = pos.accruedInterest;
            principalPaid = paid - interestPaid;
        } else {
            interestPaid  = paid;
            principalPaid = 0;
        }

        pos.accruedInterest -= uint128(interestPaid);
        pos.principal       -= uint128(principalPaid);
        totalBorrowed       -= principalPaid;

        if (excess > 0) _send(msg.sender, excess);

        uint256 remaining = uint256(pos.principal) + uint256(pos.accruedInterest);
        emit Repaid(msg.sender, principalPaid, interestPaid, remaining);
    }

    /// @notice Withdraw idle collateral that is not required to back current debt.
    function withdraw(uint256 amount) external nonReentrant {
        Position storage pos = _positions[msg.sender];
        if (!pos.active) revert NoActivePosition();

        _accrueInterest(pos);

        uint256 withdrawable = _withdrawable(pos, msg.sender);
        if (amount > withdrawable) revert InsufficientWithdrawable(amount, withdrawable);

        pos.collateral  -= uint128(amount);
        totalCollateral -= amount;

        _send(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, pos.collateral);
    }

    /// @notice Liquidate an unhealthy position.
    ///         Callable by anyone when the borrower's score has expired
    ///         OR when debt / collateral exceeds the liquidation threshold.
    ///
    ///         The caller must send enough PAS to cover the full outstanding debt.
    ///         In return they receive the borrower's collateral plus a 5 % bonus.
    ///         Any collateral remaining after the bonus is returned to the borrower.
    function liquidate(address borrower) external payable nonReentrant {
        if (borrower == msg.sender) revert("Cannot self-liquidate");

        Position storage pos = _positions[borrower];
        if (!pos.active) revert NoActivePosition();

        _accrueInterest(pos);

        uint256 debt = uint256(pos.principal) + uint256(pos.accruedInterest);
        if (debt == 0) revert NothingToRepay();

        // ── Eligibility ───────────────────────────────────────────────────────
        (, , , , bool isValid, bool exists) = scoreNFT.getScore(borrower);
        bool scoreGone = !exists || !isValid;

        if (!scoreGone) {
            // Health check: debt > collateral * liqThresh / BASIS
            Tier storage tier     = _tiers[pos.scoreTierIdx];
            uint256 liqThreshold  = (uint256(pos.collateral) * tier.liqThreshBps) / BASIS;
            if (debt <= liqThreshold) revert PositionHealthy();
        }

        // ── Payment check ─────────────────────────────────────────────────────
        require(msg.value >= debt, "Send at least the full debt amount");

        // ── Seize and redistribute ────────────────────────────────────────────
        uint256 col    = pos.collateral;
        uint256 bonus  = (col * LIQ_BONUS_BPS) / BASIS;
        // Liquidator keeps: debt repaid (already sent) + bonus from collateral
        // Anything left in collateral after bonus → back to borrower
        uint256 liquidatorGets = debt + bonus > col ? col : bonus;
        uint256 borrowerGets   = col > liquidatorGets ? col - liquidatorGets : 0;

        // Clear state before transfers
        totalBorrowed   -= uint256(pos.principal);
        totalCollateral -= col;
        delete _positions[borrower];

        // Return excess payment to liquidator
        uint256 excessPayment = msg.value - debt;
        if (excessPayment > 0) _send(msg.sender, excessPayment);

        // Collateral → liquidator (bonus portion)
        if (liquidatorGets > 0) _send(msg.sender, liquidatorGets);

        // Remainder → borrower
        if (borrowerGets > 0) _send(borrower, borrowerGets);

        emit Liquidated(borrower, msg.sender, col, bonus, debt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Full position snapshot including live accrued interest.
    /// @return collateral        PAS deposited (wei)
    /// @return principal         outstanding principal (wei)
    /// @return interestAccrued   live accrued interest including pending (wei)
    /// @return totalDebt         principal + interestAccrued (wei)
    /// @return healthFactor      (collateral / totalDebt) * 1e18; max = type(uint256).max
    /// @return ltvBps            max LTV in basis points for this tier
    /// @return liqThreshBps      liquidation threshold in basis points
    /// @return aprBps            annual rate in basis points
    /// @return active            true if position has been opened
    function getPosition(address borrower) external view returns (
        uint256 collateral,
        uint256 principal,
        uint256 interestAccrued,
        uint256 totalDebt,
        uint256 healthFactor,
        uint16  ltvBps,
        uint16  liqThreshBps,
        uint16  aprBps,
        bool    active
    ) {
        Position storage pos = _positions[borrower];
        uint256 pending = _pendingInterest(pos);
        uint256 interest = uint256(pos.accruedInterest) + pending;
        uint256 debt     = uint256(pos.principal) + interest;
        uint256 hf       = debt == 0
            ? type(uint256).max
            : (uint256(pos.collateral) * 1e18) / debt;

        Tier storage t = _tiers[pos.active ? pos.scoreTierIdx : 2];

        return (
            pos.collateral,
            pos.principal,
            interest,
            debt,
            hf,
            t.ltvBps,
            t.liqThreshBps,
            t.aprBps,
            pos.active
        );
    }

    /// @notice Idle PAS in the pool available for borrowers to draw.
    function poolLiquidity() public view returns (uint256) {
        // Contract balance minus all collateral sitting in positions
        return address(this).balance > totalCollateral
            ? address(this).balance - totalCollateral
            : 0;
    }

    /// @notice Return the tier parameters for a given score (view-only helper for front-ends).
    function tierForScore(uint16 score) external view returns (
        uint16 ltvBps,
        uint16 liqThreshBps,
        uint16 aprBps,
        string memory label,
        bool   eligible
    ) {
        if (score < _tiers[2].scoreMin) return (0, 0, 0, "Denied", false);
        uint256 idx = _tierIdxForScore(score);
        Tier storage t = _tiers[idx];
        string[3] memory labels = ["Excellent", "Good", "Fair"];
        return (t.ltvBps, t.liqThreshBps, t.aprBps, labels[idx], true);
    }

    /// @notice How much collateral a borrower can withdraw right now.
    function withdrawableCollateral(address borrower) external view returns (uint256) {
        Position storage pos = _positions[borrower];
        return _withdrawable(pos, borrower);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────────────────────────────────

    function _tierIdxForScore(uint16 score) internal view returns (uint256) {
        if (score >= _tiers[0].scoreMin) return 0;
        if (score >= _tiers[1].scoreMin) return 1;
        if (score >= _tiers[2].scoreMin) return 2;
        return 3; // ineligible
    }

    function _pendingInterest(Position storage pos) internal view returns (uint256) {
        if (pos.principal == 0 || pos.lastAccrual == 0) return 0;
        uint256 elapsed = block.timestamp - pos.lastAccrual;
        uint16  apr     = _tiers[pos.scoreTierIdx].aprBps;
        // simple linear: principal * aprBps * elapsed / (BASIS * SECS_PER_YEAR)
        return (uint256(pos.principal) * apr * elapsed) / (BASIS * SECS_PER_YEAR);
    }

    function _accrueInterest(Position storage pos) internal {
        if (pos.principal > 0 && pos.lastAccrual > 0) {
            uint256 pending = _pendingInterest(pos);
            if (pending > 0) pos.accruedInterest += uint128(pending);
        }
        pos.lastAccrual = uint64(block.timestamp);
    }

    /// @dev Minimum collateral to keep LTV healthy, given current debt.
    function _withdrawable(Position storage pos, address borrower) internal view returns (uint256) {
        uint256 pending = _pendingInterest(pos);
        uint256 debt    = uint256(pos.principal) + uint256(pos.accruedInterest) + pending;
        if (debt == 0) return pos.collateral;

        // Use live score for withdrawal check — reward score improvements
        (uint16 liveScore, , , , bool isValid, bool exists) = scoreNFT.getScore(borrower);
        uint256 idx = (exists && isValid) ? _tierIdxForScore(liveScore) : pos.scoreTierIdx;
        if (idx > 2) idx = 2; // cap to fair tier (most conservative) if ineligible

        uint16 ltvBps = _tiers[idx].ltvBps;
        // need: collateral * ltvBps / BASIS >= debt
        // min collateral = ceil(debt * BASIS / ltvBps)
        uint256 minCol = (debt * BASIS + ltvBps - 1) / ltvBps;
        return uint256(pos.collateral) > minCol ? uint256(pos.collateral) - minCol : 0;
    }

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, ) = payable(to).call{ value: amount }("");
        if (!ok) revert TransferFailed();
    }

    // ── Admin ─────────────────────────────────────────────────────────────────

    function pause()   external onlyOwner { _pause();   }
    function unpause() external onlyOwner { _unpause(); }

    receive() external payable {}
}
