// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PropertyDeed is ERC721URIStorage, Ownable {
    uint256 public _tokenIds;

    constructor() ERC721("PropertyDeed", "PDEED") Ownable(msg.sender) {}
    function getCurrentTokenId() public view returns (uint256) {
    return _tokenIds;}

    function mintDeed(address to, string memory tokenURI) public onlyOwner returns (uint256) {
        _tokenIds += 1;
        uint256 newDeedId = _tokenIds;
        _safeMint(to, newDeedId);
        _setTokenURI(newDeedId, tokenURI);
        return newDeedId;
    }
}
