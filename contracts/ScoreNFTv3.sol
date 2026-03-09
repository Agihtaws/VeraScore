// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ─────────────────────────────────────────────────────────────────────────────
// VeraScore — ScoreNFTv3
//
// V1  proxy + issueScore()
// V2  EIP-712 mintScore(), DOMAIN_SEPARATOR, nonces, _expiresAt
// V3  on-chain SVG tokenURI — no IPFS, no external hosting
//
// Proxy (permanent): 0xbb778Ec1482bbdF08527c1cac1569662caf1faAE
// OZ ^5.0.0  — _update() soulbound pattern
// viaIR: true in hardhat.config.ts (required for SVG string builders)
// ─────────────────────────────────────────────────────────────────────────────

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ScoreNFTv3 is
    Initializable,
    ERC721Upgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using Strings for uint256;

    // ─── V1 storage — copied byte-for-byte from ScoreNFTv2 ──────────────────
    // NEVER reorder, rename, or remove these slots.

    struct ScoreData {
        uint16  score;
        uint64  issuedAt;
        bytes32 dataHash;
        bool    exists;
    }

    address                       public  issuer;
    mapping(address => ScoreData) private _scores;
    mapping(address => uint256)   private _walletToTokenId;
    uint256                       private _tokenIdCounter;

    // ─── V2 storage — copied byte-for-byte from ScoreNFTv2 ──────────────────

    bytes32 public DOMAIN_SEPARATOR;

    bytes32 public constant SCORE_TYPEHASH = keccak256(
        "Score(address wallet,uint16 score,bytes32 dataHash,uint256 nonce,uint256 deadline)"
    );

    mapping(address => uint256) public  nonces;

    uint64 public constant EXPIRY_DURATION   = 2 hours;   // TESTNET: was 30 days
    uint64 public constant COOLDOWN_DURATION =  5 minutes; // TESTNET: was 7 days

    mapping(address => uint64) private _expiresAt;

    // ─── V3 storage — appended after all V2 slots ────────────────────────────
    // 6 categories × 8 bits packed into uint48
    // slot order: [txActivity | accountAge | nativeBalance | usdtHolding | usdcHolding | complexity]
    mapping(address => uint48) private _breakdowns;

    // ─── Events ──────────────────────────────────────────────────────────────
    event ScoreIssued(address indexed wallet, uint16 score, bytes32 dataHash, uint64 issuedAt, uint64 expiresAt);
    event IssuerUpdated(address indexed oldIssuer, address indexed newIssuer);
    event BreakdownRecorded(address indexed wallet, uint48 packed);

    // ─── Errors ──────────────────────────────────────────────────────────────
    error NotIssuer();
    error InvalidSignature();
    error DeadlineExpired();
    error CooldownActive(uint64 refreshAvailableAt);
    error InvalidScore();
    error SoulboundToken();
    error ZeroAddress();
    error TokenDoesNotExist(uint256 tokenId);

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() { _disableInitializers(); }

    // ─── V3 initializer ──────────────────────────────────────────────────────
    // @custom:oz-upgrades-validate-as-initializer
    function initializeV3() external reinitializer(3) {
        // No new state to initialise.
        // DOMAIN_SEPARATOR, issuer, and all mappings carry over from V2.
    }

    // ─── mintScore — identical to V2 ─────────────────────────────────────────

    function mintScore(
        address        wallet,
        uint16         score,
        bytes32        dataHash,
        uint256        deadline,
        bytes calldata signature
    ) external {
        if (wallet == address(0))        revert ZeroAddress();
        if (score > 1000)                revert InvalidScore();
        if (block.timestamp > deadline)  revert DeadlineExpired();

        bytes32 structHash = keccak256(abi.encode(
            SCORE_TYPEHASH, wallet, score, dataHash, nonces[wallet], deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        if (_recoverSigner(digest, signature) != issuer) revert InvalidSignature();

        ScoreData storage existing = _scores[wallet];
        if (existing.exists) {
            uint64 available = existing.issuedAt + COOLDOWN_DURATION;
            if (uint64(block.timestamp) < available) revert CooldownActive(available);
        }

        uint64 issuedAt  = uint64(block.timestamp);
        uint64 expiresAt = issuedAt + EXPIRY_DURATION;

        _scores[wallet] = ScoreData({ score: score, issuedAt: issuedAt, dataHash: dataHash, exists: true });
        _expiresAt[wallet] = expiresAt;
        nonces[wallet]++;

        if (_walletToTokenId[wallet] == 0) {
            _tokenIdCounter++;
            uint256 tokenId = _tokenIdCounter;
            _walletToTokenId[wallet] = tokenId;
            _safeMint(wallet, tokenId);
        }

        emit ScoreIssued(wallet, score, dataHash, issuedAt, expiresAt);
    }

    // ─── V3: breakdown storage ────────────────────────────────────────────────

    /// @notice Store the 6-category score breakdown. Issuer only.
    ///         Called by backend after mintScore confirms on-chain.
    function recordBreakdown(address wallet, uint8[6] calldata bd) external onlyIssuer {
        uint48 packed =
            (uint48(bd[0]) << 40) |
            (uint48(bd[1]) << 32) |
            (uint48(bd[2]) << 24) |
            (uint48(bd[3]) << 16) |
            (uint48(bd[4]) <<  8) |
             uint48(bd[5]);
        _breakdowns[wallet] = packed;
        emit BreakdownRecorded(wallet, packed);
    }

    function getBreakdown(address wallet) external view returns (uint8[6] memory bd) {
        uint48 p = _breakdowns[wallet];
        bd[0] = uint8(p >> 40);
        bd[1] = uint8(p >> 32);
        bd[2] = uint8(p >> 24);
        bd[3] = uint8(p >> 16);
        bd[4] = uint8(p >>  8);
        bd[5] = uint8(p);
    }

    // ─── tokenURI — fully on-chain SVG ───────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert TokenDoesNotExist(tokenId);

        address      wallet = _ownerOf(tokenId);
        ScoreData memory sd = _scores[wallet];
        uint64       expAt  = _expiresAt[wallet];

        string memory imgUri = string.concat(
            "data:image/svg+xml;base64,",
            Base64.encode(bytes(_buildSVG(wallet, sd, expAt)))
        );

        return string.concat(
            "data:application/json;base64,",
            Base64.encode(bytes(string.concat(
                '{"name":"VeraScore #', tokenId.toString(), '",'
                '"description":"AI-powered on-chain credit score for Polkadot Hub. Soulbound.",'
                '"image":"', imgUri, '",'
                '"attributes":', _buildAttrs(sd, expAt), '}'
            )))
        );
    }

    // ─── SVG — split into small functions to stay under stack depth limit ─────

    function _buildSVG(
        address wallet,
        ScoreData memory sd,
        uint64 expAt
    ) internal view returns (string memory) {
        bool valid = sd.exists && block.timestamp <= expAt;
        return string.concat(
            _svgOpen(),
            _svgLogo(),
            _svgGauge(sd.score),
            _svgBadges(sd.score, valid),
            '<line x1="24" y1="250" x2="376" y2="250" stroke="#222" stroke-width="1"/>',
            _svgAllBars(wallet, sd.score),
            '<line x1="24" y1="432" x2="376" y2="432" stroke="#222" stroke-width="1"/>',
            _svgFooter(wallet, expAt, valid),
            '</svg>'
        );
    }

    function _svgOpen() internal pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 520" width="400" height="520">',
            '<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#0a0a0a"/>',
            '<stop offset="100%" stop-color="#12051a"/>',
            '</linearGradient></defs>',
            '<rect width="400" height="520" fill="url(#bg)" rx="20"/>',
            '<rect x="1" y="1" width="398" height="518" fill="none" stroke="#e6007a" stroke-width="1.5" rx="19" opacity="0.45"/>'
        );
    }

    function _svgLogo() internal pure returns (string memory) {
        return string.concat(
            '<circle cx="30" cy="30" r="14" fill="#e6007a"/>',
            '<text x="30" y="35" text-anchor="middle" fill="white" font-size="13" font-weight="bold" font-family="monospace">V</text>',
            '<text x="52" y="37" fill="white" font-size="15" font-weight="bold" font-family="sans-serif">VeraScore</text>',
            '<text x="376" y="20" text-anchor="end" fill="#383838" font-size="9" font-family="monospace">PAS TESTNET</text>',
            '<text x="376" y="32" text-anchor="end" fill="#303030" font-size="9" font-family="monospace">SOULBOUND NFT</text>'
        );
    }

    function _svgGauge(uint16 score) internal pure returns (string memory) {
        // 240° arc, centre (200,160), r=72, full arc ≈ 301.6 → scale ×10 = 3016
        uint256 dash10 = (uint256(score) * 3016) / 1000;
        string memory color = _tierColor(score);
        return string.concat(
            '<path d="M 137.6 196 A 72 72 0 1 1 262.4 196" fill="none" stroke="#232323" stroke-width="9" stroke-linecap="round"/>',
            '<path d="M 137.6 196 A 72 72 0 1 1 262.4 196" fill="none" stroke="', color,
                '" stroke-width="9" stroke-linecap="round" stroke-dasharray="',
                _dec1(dash10), ' 302" stroke-dashoffset="0"/>',
            '<text x="200" y="182" text-anchor="middle" fill="', color,
                '" font-size="60" font-weight="bold" font-family="monospace">', uint256(score).toString(), '</text>',
            '<text x="200" y="202" text-anchor="middle" fill="#3a3a3a" font-size="11" font-family="sans-serif">out of 1000</text>'
        );
    }

    function _svgBadges(uint16 score, bool valid) internal pure returns (string memory) {
        string memory color  = _tierColor(score);
        string memory tierBg = score >= 750 ? "#051a0d" : score >= 500 ? "#1a1500" : score >= 250 ? "#1a0c00" : "#1a0505";
        string memory vBadge = valid
            ? '<rect x="286" y="214" width="89" height="22" rx="11" fill="#051a0d"/><text x="330" y="229" text-anchor="middle" fill="#4ade80" font-size="10" font-weight="bold" font-family="sans-serif">&#x2713; VALID</text>'
            : '<rect x="286" y="214" width="89" height="22" rx="11" fill="#1a0505"/><text x="330" y="229" text-anchor="middle" fill="#f87171" font-size="10" font-weight="bold" font-family="sans-serif">EXPIRED</text>';
        return string.concat(
            '<rect x="100" y="214" width="112" height="22" rx="11" fill="', tierBg, '"/>',
            '<rect x="100" y="214" width="112" height="22" rx="11" fill="none" stroke="', color, '" stroke-width="0.75"/>',
            '<text x="156" y="229" text-anchor="middle" fill="', color,
                '" font-size="10" font-weight="bold" font-family="sans-serif">', _tierLabel(score), '</text>',
            vBadge
        );
    }

    function _svgAllBars(address wallet, uint16 score) internal view returns (string memory) {
        uint48 p = _breakdowns[wallet];
        uint8[6] memory v;

        if (p == 0) {
            v[0] = _est(score, 200);
            v[1] = _est(score, 100);
            v[2] = _est(score, 150);
            v[3] = _est(score, 200);
            v[4] = _est(score, 150);
            v[5] = _est(score, 200);
        } else {
            v[0] = uint8(p >> 40);
            v[1] = uint8(p >> 32);
            v[2] = uint8(p >> 24);
            v[3] = uint8(p >> 16);
            v[4] = uint8(p >>  8);
            v[5] = uint8(p);
        }

        string memory color = _tierColor(score);
        return string.concat(
            _oneBar(0, "Transaction Activity", v[0], 200, color),
            _oneBar(1, "Account Age",          v[1], 100, color),
            _oneBar(2, "Native PAS Balance",   v[2], 150, color),
            _oneBar(3, "USDT Holding",         v[3], 200, color),
            _oneBar(4, "USDC Holding",         v[4], 150, color),
            _oneBar(5, "Account Complexity",   v[5], 200, color)
        );
    }

    function _oneBar(
        uint8         index,
        string memory label,
        uint8         val,
        uint16        maxScore,
        string memory color
    ) internal pure returns (string memory) {
        uint256 y    = 262 + uint256(index) * 28;
        uint256 barW = (uint256(val) * 304) / uint256(maxScore);
        string memory yStr  = y.toString();
        string memory y4Str = (y + 4).toString();
        return string.concat(
            '<text x="24"  y="', yStr, '" fill="#484848" font-size="8" font-family="sans-serif">', label, '</text>',
            '<text x="376" y="', yStr, '" text-anchor="end" fill="#505050" font-size="8" font-family="monospace">',
                uint256(val).toString(), '/', uint256(maxScore).toString(), '</text>',
            '<rect x="24" y="', y4Str, '" width="304" height="5" rx="2.5" fill="#1a1a1a"/>',
            barW > 0
                ? string.concat('<rect x="24" y="', y4Str, '" width="', barW.toString(), '" height="5" rx="2.5" fill="', color, '"/>')
                : ""
        );
    }

    function _est(uint16 score, uint16 maxScore) internal pure returns (uint8) {
        uint256 v = (uint256(score) * uint256(maxScore)) / 1000;
        return v > 255 ? 255 : uint8(v);
    }

    function _svgFooter(address wallet, uint64 expiresAt, bool valid) internal pure returns (string memory) {
        return string.concat(
            '<text x="24"  y="452" fill="#383838" font-size="9" font-family="monospace">WALLET</text>',
            '<text x="376" y="452" text-anchor="end" fill="#666" font-size="9" font-family="monospace">', _abbreviate(wallet), '</text>',
            '<text x="24"  y="470" fill="#383838" font-size="9" font-family="monospace">', valid ? "VALID UNTIL" : "EXPIRED ON", '</text>',
            '<text x="376" y="470" text-anchor="end" fill="', valid ? "#4ade80" : "#f87171",
                '" font-size="9" font-family="monospace">', _formatDate(expiresAt), '</text>',
            '<text x="24"  y="488" fill="#383838" font-size="9" font-family="monospace">CHAIN</text>',
            '<text x="376" y="488" text-anchor="end" fill="#383838" font-size="9" font-family="monospace">POLKADOT HUB TESTNET 420420417</text>',
            '<text x="200" y="513" text-anchor="middle" fill="#282828" font-size="8" font-family="monospace">verascore.xyz  |  AI CREDIT SCORING ON POLKADOT</text>'
        );
    }

    function _buildAttrs(ScoreData memory sd, uint64 expAt) internal view returns (string memory) {
        bool valid = sd.exists && block.timestamp <= expAt;
        return string.concat(
            '[',
            '{"trait_type":"Score","value":',   uint256(sd.score).toString(),   '},',
            '{"trait_type":"Tier","value":"',    _tierLabel(sd.score),           '"},',
            '{"trait_type":"Valid","value":"',   valid ? "true" : "false",       '"},',
            '{"trait_type":"Issued","value":',   uint256(sd.issuedAt).toString(),'},',
            '{"trait_type":"Expires","value":', uint256(expAt).toString(),       '},',
            '{"trait_type":"Network","value":"Polkadot Hub PAS TestNet"},',
            '{"trait_type":"ChainID","value":"420420417"}',
            ']'
        );
    }

    // ─── Public views — identical to V2 ──────────────────────────────────────

    function getScore(address wallet) external view returns (
        uint16 score, uint64 issuedAt, uint64 expiresAt,
        bytes32 dataHash, bool isValid, bool exists
    ) {
        ScoreData storage d = _scores[wallet];
        uint64 exp          = _expiresAt[wallet];
        return (d.score, d.issuedAt, exp, d.dataHash, d.exists && block.timestamp <= exp, d.exists);
    }

    function hasScore(address wallet)    external view returns (bool)    { return _scores[wallet].exists; }
    function isScoreValid(address wallet) external view returns (bool)   {
        return _scores[wallet].exists && block.timestamp <= _expiresAt[wallet];
    }
    function totalScored()               external view returns (uint256) { return _tokenIdCounter; }
    function tokenIdOf(address wallet)   external view returns (uint256) { return _walletToTokenId[wallet]; }
    function refreshAvailableAt(address wallet) external view returns (uint64) {
        ScoreData storage d = _scores[wallet];
        if (!d.exists) return 0;
        uint64 available = d.issuedAt + COOLDOWN_DURATION;
        return block.timestamp < available ? available : 0;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    function setIssuer(address newIssuer) external onlyOwner {
        if (newIssuer == address(0)) revert ZeroAddress();
        emit IssuerUpdated(issuer, newIssuer);
        issuer = newIssuer;
    }

    // ─── Soulbound — identical to V2 ─────────────────────────────────────────

    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert SoulboundToken();
        return super._update(to, tokenId, auth);
    }

    // ─── EIP-712 ─────────────────────────────────────────────────────────────

    function _recoverSigner(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    // ─── String utils ─────────────────────────────────────────────────────────

    function _tierLabel(uint16 score) internal pure returns (string memory) {
        if (score >= 750) return "Excellent";
        if (score >= 500) return "Good";
        if (score >= 250) return "Fair";
        return "New Wallet";
    }

    function _tierColor(uint16 score) internal pure returns (string memory) {
        if (score >= 750) return "#22c55e";
        if (score >= 500) return "#eab308";
        if (score >= 250) return "#f97316";
        return "#ef4444";
    }

    function _abbreviate(address wallet) internal pure returns (string memory) {
        bytes memory b   = bytes(Strings.toHexString(uint256(uint160(wallet)), 20));
        bytes memory out = new bytes(13);
        out[0] = b[0];  out[1] = b[1];
        out[2] = b[2];  out[3] = b[3];  out[4] = b[4];  out[5] = b[5];
        out[6] = '.';   out[7] = '.';   out[8] = '.';
        out[9] = b[38]; out[10] = b[39]; out[11] = b[40]; out[12] = b[41];
        return string(out);
    }

    function _formatDate(uint64 ts) internal pure returns (string memory) {
        uint256 z   = uint256(ts) / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365;
        uint256 y   = yoe + era * 400;
        uint256 doy = doe - (365*yoe + yoe/4 - yoe/100);
        uint256 mp  = (5*doy + 2) / 153;
        uint256 d   = doy - (153*mp + 2)/5 + 1;
        uint256 m   = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y++;
        return string.concat(_d4(y % 10000), "-", _d2(m), "-", _d2(d));
    }

    function _d2(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(2);
        b[0] = bytes1(uint8(48 + (n/10)%10));
        b[1] = bytes1(uint8(48 + n%10));
        return string(b);
    }

    function _d4(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(4);
        b[0] = bytes1(uint8(48 + (n/1000)%10));
        b[1] = bytes1(uint8(48 + (n/100)%10));
        b[2] = bytes1(uint8(48 + (n/10)%10));
        b[3] = bytes1(uint8(48 + n%10));
        return string(b);
    }

    // n is ×10 — returns "X.Y"  e.g. 3016 → "301.6"
    function _dec1(uint256 n) internal pure returns (string memory) {
        return string.concat((n/10).toString(), ".", (n%10).toString());
    }

    // ─── UUPS ────────────────────────────────────────────────────────────────
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
