// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title  ScoreNFTv2
 * @author VeraScore
 * @notice Soulbound AI credit score NFT on Polkadot Hub PAS TestNet.
 *
 * V2 upgrade adds:
 *   - EIP-712 typed data signature verification (issuer signs off-chain)
 *   - Per-wallet nonce tracking (prevents signature replay attacks)
 *   - Deadline enforcement on every mint
 *   - 30-day score expiry
 *   - 7-day refresh cooldown between on-chain updates
 *
 * Proxy address is permanent: 0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
 * V1 scores and storage layout are fully preserved — storage is append-only.
 */
contract ScoreNFTv2 is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    // ─────────────────────────────────────────────────────────────────────────
    // Storage — V1 layout (MUST NOT be reordered or removed)
    // ─────────────────────────────────────────────────────────────────────────

    struct ScoreData {
        uint16  score;    // 0–1000
        uint64  issuedAt; // unix timestamp of last mint
        bytes32 dataHash; // keccak256 of full analysis JSON
        bool    exists;
    }

    address                       public issuer;
    mapping(address => ScoreData) private _scores;
    mapping(address => uint256)   private _walletToTokenId;
uint256                           private _tokenIdCounter;

    // ─────────────────────────────────────────────────────────────────────────
    // Storage — V2 additions (appended strictly after V1)
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice EIP-712 domain separator — computed once in initializeV2()
    bytes32 public DOMAIN_SEPARATOR;

    /// @notice EIP-712 Score typehash
    bytes32 public constant SCORE_TYPEHASH = keccak256(
        "Score(address wallet,uint16 score,bytes32 dataHash,uint256 nonce,uint256 deadline)"
    );

    /// @notice Per-wallet nonce — incremented after every successful mint
    mapping(address => uint256) public nonces;

    /// @notice Expiry duration: 30 days from mint
    uint64 public constant EXPIRY_DURATION = 30 days;

    /// @notice Cooldown between refreshes: 7 days
    uint64 public constant COOLDOWN_DURATION = 7 days;

    /// @notice expiresAt per wallet (V2 addition)
    mapping(address => uint64) private _expiresAt;

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    event ScoreIssued(
        address indexed wallet,
        uint16          score,
        bytes32         dataHash,
        uint64          issuedAt,
        uint64          expiresAt
    );

    event IssuerUpdated(
        address indexed oldIssuer,
        address indexed newIssuer
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Custom errors — cheaper than string reverts
    // ─────────────────────────────────────────────────────────────────────────

    error NotIssuer();
    error InvalidSignature();
    error DeadlineExpired();
    error CooldownActive(uint64 refreshAvailableAt);
    error InvalidScore();
    error SoulboundToken();
    error ZeroAddress();

    // ─────────────────────────────────────────────────────────────────────────
    // Constructor — disables initializers on implementation contract
    // ─────────────────────────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Initializer — V1 (already called on proxy, never called again)
    // ─────────────────────────────────────────────────────────────────────────

    function initialize(address _issuer) public initializer {
        if (_issuer == address(0)) revert ZeroAddress();
        __ERC721_init("VeraScore", "VSCORE");
        __Ownable_init(_issuer);
        issuer = _issuer;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // V2 Reinitializer — called exactly once during the upgrade transaction
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Builds and stores the EIP-712 domain separator.
     *         reinitializer(2) guarantees this runs exactly once on this version.
     *         Called automatically inside the upgrade script via upgradeProxy.
     */
    function initializeV2() public reinitializer(2) {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256(
                "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
            ),
            keccak256(bytes("VeraScore")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Core mint — EIP-712 verified
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Mint or refresh a soulbound score NFT.
     *
     * Anyone can call this with a valid issuer signature — typically the
     * frontend calls it after the backend returns the signed payload.
     *
     * @param wallet    Address to receive / refresh the score
     * @param score     Credit score 0–1000
     * @param dataHash  keccak256 of full analysis JSON
     * @param deadline  Signature expires after this unix timestamp
     * @param signature 65-byte EIP-712 signature from the trusted issuer
     *
     * Security: follows CEI — all state written before _safeMint (external call)
     */
    function mintScore(
        address        wallet,
        uint16         score,
        bytes32        dataHash,
        uint256        deadline,
        bytes calldata signature
    ) external {
        // ── Input validation ──────────────────────────────────
        if (wallet == address(0))       revert ZeroAddress();
        if (score > 1000)               revert InvalidScore();
        if (block.timestamp > deadline) revert DeadlineExpired();

        // ── EIP-712 signature verification ───────────────────
        bytes32 structHash = keccak256(abi.encode(
            SCORE_TYPEHASH,
            wallet,
            score,
            dataHash,
            nonces[wallet],
            deadline
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            structHash
        ));

        if (_recoverSigner(digest, signature) != issuer) {
            revert InvalidSignature();
        }

        // ── 7-day cooldown enforcement ────────────────────────
        ScoreData storage existing = _scores[wallet];
        if (existing.exists) {
            uint64 available = existing.issuedAt + COOLDOWN_DURATION;
            if (uint64(block.timestamp) < available) {
                revert CooldownActive(available);
            }
        }

        // ── State updates (CEI — all state before _safeMint) ──
        uint64 issuedAt  = uint64(block.timestamp);
        uint64 expiresAt = issuedAt + EXPIRY_DURATION;

        _scores[wallet] = ScoreData({
            score:    score,
            issuedAt: issuedAt,
            dataHash: dataHash,
            exists:   true
        });

        _expiresAt[wallet] = expiresAt;

        // Increment nonce — this signature can never be replayed
        nonces[wallet]++;

        // ── Mint on first score only ──────────────────────────
        // On refresh the token already exists — just update storage above
        if (_walletToTokenId[wallet] == 0) {
            _tokenIdCounter++;
            uint256 tokenId = _tokenIdCounter;
            _walletToTokenId[wallet] = tokenId;
            _safeMint(wallet, tokenId); // external call last — CEI satisfied
        }

        emit ScoreIssued(wallet, score, dataHash, issuedAt, expiresAt);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Read functions
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Full score data for any wallet.
     * @return score      The credit score 0–1000
     * @return issuedAt   Unix timestamp when score was last issued
     * @return expiresAt  Unix timestamp when score expires (issuedAt + 30 days)
     * @return dataHash   keccak256 proof of the analysis data
     * @return isValid    True if score exists and has not expired
     * @return exists     True if this wallet has ever been scored
     */
    function getScore(address wallet) external view returns (
        uint16  score,
        uint64  issuedAt,
        uint64  expiresAt,
        bytes32 dataHash,
        bool    isValid,
        bool    exists
    ) {
        ScoreData storage d = _scores[wallet];
        uint64 exp          = _expiresAt[wallet];
        return (
            d.score,
            d.issuedAt,
            exp,
            d.dataHash,
            d.exists && uint64(block.timestamp) <= exp,
            d.exists
        );
    }

    /// @notice Returns true if the wallet has a score (expired or not)
    function hasScore(address wallet) external view returns (bool) {
        return _scores[wallet].exists;
    }

    /// @notice Returns true if the wallet has a currently valid (unexpired) score
    function isScoreValid(address wallet) external view returns (bool) {
        ScoreData storage d = _scores[wallet];
        return d.exists && uint64(block.timestamp) <= _expiresAt[wallet];
    }

    /**
     * @notice When can this wallet next refresh their score?
     * @return Unix timestamp of next allowed refresh, or 0 if no cooldown active
     */
    function refreshAvailableAt(address wallet) external view returns (uint64) {
        ScoreData storage d = _scores[wallet];
        if (!d.exists) return 0;
        uint64 available = d.issuedAt + COOLDOWN_DURATION;
        return uint64(block.timestamp) < available ? available : 0;
    }

    /// @notice Total unique wallets that have ever been scored
    function totalScored() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Soulbound — block ALL transfers (mint only)
    // ─────────────────────────────────────────────────────────────────────────

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice Transfer issuer role — only callable by owner
    function setIssuer(address newIssuer) external onlyOwner {
        if (newIssuer == address(0)) revert ZeroAddress();
        emit IssuerUpdated(issuer, newIssuer);
        issuer = newIssuer;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UUPS authorisation
    // ─────────────────────────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─────────────────────────────────────────────────────────────────────────
    // Internal — signature recovery
    // ─────────────────────────────────────────────────────────────────────────

    function _recoverSigner(
        bytes32 digest,
        bytes calldata sig
    ) internal pure returns (address) {
        if (sig.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8   v;

        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }

        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);

        return ecrecover(digest, v, r, s);
    }
}
