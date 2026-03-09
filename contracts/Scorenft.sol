// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title ScoreNFT — VeraScore Foundation Contract
 * @notice AI-powered on-chain credit scoring. PAS TestNet (Chain ID: 420420417)
 * @dev UUPS proxy — proxy address is permanent, implementation is upgradeable.
 */
contract ScoreNFT is ERC721Upgradeable, UUPSUpgradeable, OwnableUpgradeable {

    // ─── Storage ───────────────────────────────────────────

    struct ScoreRecord {
        uint16  score;      // 0–1000
        uint64  issuedAt;   // block.timestamp at mint
        bytes32 dataHash;   // keccak256 of full Mistral AI analysis JSON
    }

    address public issuer;

    mapping(address => ScoreRecord) private _scores;
    mapping(address => uint256)     private _walletToTokenId;
    uint256 private _tokenIdCounter;

    // ─── Events ────────────────────────────────────────────

    event ScoreIssued(
        address indexed wallet,
        uint16          score,
        uint256         tokenId,
        bytes32         dataHash,
        uint64          issuedAt
    );

    event IssuerUpdated(address indexed oldIssuer, address indexed newIssuer);

    // ─── Errors ────────────────────────────────────────────

    error NotIssuer(address caller, address expected);
    error InvalidScore(uint16 score);
    error ZeroAddress();
    error SoulboundTransferBlocked();

    // ─── Initializer ───────────────────────────────────────

    /// @param _issuer  Backend wallet that signs and issues scores
    /// @param _owner   Wallet that can upgrade the contract via UUPS
    function initialize(address _issuer, address _owner) public initializer {
        if (_issuer == address(0)) revert ZeroAddress();
        if (_owner  == address(0)) revert ZeroAddress();

        __ERC721_init("VeraScore", "VERA");
        __Ownable_init(_owner);

        issuer = _issuer;
        _tokenIdCounter = 1;

        emit IssuerUpdated(address(0), _issuer);
    }

    // ─── Core ──────────────────────────────────────────────

    /**
     * @notice Issue a credit score NFT to a wallet.
     * @dev Only callable by trusted issuer. One token per wallet max.
     *      Updating an existing score does not mint a new token.
     */
    function issueScore(
        address wallet,
        uint16  score,
        bytes32 dataHash
    ) external {
        if (msg.sender != issuer) revert NotIssuer(msg.sender, issuer);
        if (wallet == address(0)) revert ZeroAddress();
        if (score > 1000)         revert InvalidScore(score);

        uint64 issuedAt = uint64(block.timestamp);

        // CEI — update state before external call
        _scores[wallet] = ScoreRecord({
            score:    score,
            issuedAt: issuedAt,
            dataHash: dataHash
        });

        uint256 tokenId;

        if (_walletToTokenId[wallet] == 0) {
            tokenId = _tokenIdCounter++;
            _walletToTokenId[wallet] = tokenId;
            _safeMint(wallet, tokenId); // external call last
        } else {
            tokenId = _walletToTokenId[wallet];
        }

        emit ScoreIssued(wallet, score, tokenId, dataHash, issuedAt);
    }

    // ─── Read ──────────────────────────────────────────────

    function getScore(address wallet)
        external
        view
        returns (
            uint16  score,
            uint64  issuedAt,
            bytes32 dataHash,
            bool    exists
        )
    {
        ScoreRecord memory r = _scores[wallet];
        return (r.score, r.issuedAt, r.dataHash, r.issuedAt > 0);
    }

    function getTokenId(address wallet) external view returns (uint256) {
        return _walletToTokenId[wallet];
    }

    function hasScore(address wallet) external view returns (bool) {
        return _scores[wallet].issuedAt > 0;
    }

    function totalScored() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }

    // ─── Issuer Management ─────────────────────────────────

    function setIssuer(address newIssuer) external onlyOwner {
        if (newIssuer == address(0)) revert ZeroAddress();
        emit IssuerUpdated(issuer, newIssuer);
        issuer = newIssuer;
    }

    // ─── Soulbound ─────────────────────────────────────────

    /// @dev Blocks all transfers. Only minting (from == address(0)) is allowed.
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert SoulboundTransferBlocked();
        return super._update(to, tokenId, auth);
    }

    // ─── UUPS ──────────────────────────────────────────────

    /// @dev Only owner can authorize an implementation upgrade.
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
