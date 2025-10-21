// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


contract PropertyEscrow is ReentrancyGuard {

    enum Status { None, Listed, Funded, BuyerConfirmed, SellerConfirmed, BothConfirmed, Finalized, Cancelled, Expired }

    struct Deal {
        address seller;
        address buyer;
        uint256 price;
        uint256 deadline;
        bool buyerConfirmed;
        bool sellerConfirmed;
        Status status;
    }

    IERC721 public immutable deed;
    mapping(uint256 => Deal) public deals;

    event Listed(uint256 propertyId, address seller, uint256 price, uint256 deadline);
    event BuyerDeposit(uint256 propertyId, address buyer, uint256 price);
    event BuyerConfirmed(uint256 propertyId);
    event SellerConfirmed(uint256 propertyId);
    event Finalized(uint256 propertyId, address seller, address buyer, uint256 price);
    event Cancelled(uint256 propertyId);
    event Refunded(uint256 propertyId);
    event OwnershipTransferred(uint256 propertyId, address from, address to); // for government notification

    constructor(IERC721 _deed) {
        deed = _deed;
    }

    function list(uint256 propertyId, uint256 price, uint256 deadline) external {
        require(price > 0, "Price required");
        require(deadline > block.timestamp, "Bad deadline");
        require(deals[propertyId].status == Status.None, "Already listed");

        deed.transferFrom(msg.sender, address(this), propertyId);

        deals[propertyId] = Deal({
            seller: msg.sender,
            buyer: address(0),
            price: price,
            deadline: deadline,
            buyerConfirmed: false,
            sellerConfirmed: false,
            status: Status.Listed
        });

        emit Listed(propertyId, msg.sender, price, deadline);
    }

    function depositEarnest() external payable {
    require(msg.value > 0, "No ETH sent");
    // record deposit, e.g., deposits[msg.sender] += msg.value;
    }

    function deposit(uint256 propertyId) external payable nonReentrant {
        Deal storage d = deals[propertyId];
        require(d.status == Status.Listed, "Not listed");
        require(msg.value == d.price, "Wrong amount");

        d.buyer = msg.sender;
        d.status = Status.Funded;

        emit BuyerDeposit(propertyId, msg.sender, msg.value);
    }

    function buyerConfirm(uint256 propertyId) external {
        Deal storage d = deals[propertyId];
        require(msg.sender == d.buyer, "Not buyer");

        d.buyerConfirmed = true;
        if (d.sellerConfirmed) {
            d.status = Status.BothConfirmed;
        } else {
            d.status = Status.BuyerConfirmed;
        }

        emit BuyerConfirmed(propertyId);
    }

    function sellerConfirm(uint256 propertyId) external {
        Deal storage d = deals[propertyId];
        require(msg.sender == d.seller, "Not seller");

        d.sellerConfirmed = true;
        if (d.buyerConfirmed) {
            d.status = Status.BothConfirmed;
        } else {
            d.status = Status.SellerConfirmed;
        }

        emit SellerConfirmed(propertyId);
    }

    function finalize(uint256 propertyId) external nonReentrant {
        Deal storage d = deals[propertyId];
        require(d.status == Status.BothConfirmed, "Not both confirmed");
        require(block.timestamp <= d.deadline, "Expired");

        d.status = Status.Finalized;

        deed.safeTransferFrom(address(this), d.buyer, propertyId);
        (bool sent, ) = payable(d.seller).call{value: d.price}("");
        require(sent, "Payment failed");

        emit Finalized(propertyId, d.seller, d.buyer, d.price);
        emit OwnershipTransferred(propertyId, d.seller, d.buyer); // event for notification
    }

    function refund(uint256 propertyId) external nonReentrant {
        Deal storage d = deals[propertyId];
        require(block.timestamp > d.deadline, "Not expired yet");
        require(d.status == Status.Funded || d.status == Status.BuyerConfirmed || d.status == Status.SellerConfirmed, "Not refundable");

        d.status = Status.Expired;

        deed.safeTransferFrom(address(this), d.seller, propertyId);
        (bool sent, ) = payable(d.buyer).call{value: d.price}("");
        require(sent, "Refund failed");

        emit Refunded(propertyId);
    }

    function cancel(uint256 propertyId) external {
        Deal storage d = deals[propertyId];
        require(msg.sender == d.seller, "Not seller");
        require(d.status == Status.Listed, "Can't cancel now");

        d.status = Status.Cancelled;
        deed.safeTransferFrom(address(this), d.seller, propertyId);

        emit Cancelled(propertyId);
    }
}
