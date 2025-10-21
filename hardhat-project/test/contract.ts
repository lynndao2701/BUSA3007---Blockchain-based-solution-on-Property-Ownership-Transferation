import { network } from "hardhat"; 
import { expect } from "chai"; 
const {ethers} = await network.connect();
import { Contract } from "ethers";

describe("PropertyEscrow", function () {
  let escrow: Contract;
  let deed: Contract;
  let deployer: any, seller: any, buyer: any;

  beforeEach(async function () {
    [deployer, seller, buyer] = await ethers.getSigners();

    // Deploy PropertyDeed
    const Deed = await ethers.getContractFactory("PropertyDeed");
    deed = await Deed.connect(deployer).deploy();
    await deed.waitForDeployment();

    // Deploy PropertyEscrow
    const deedAddress = await deed.getAddress();
    const Escrow = await ethers.getContractFactory("PropertyEscrow");
    escrow = await Escrow.connect(deployer).deploy(deedAddress);
    await escrow.waitForDeployment();

    // Mint property deed to seller
    await deed.connect(deployer).mintDeed(seller.address, "ipfs://property-metadata-1");
  });

  it("Should allow seller to list a property", async function () {
    const propertyId = 1;
    const price = ethers.parseEther("1");
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    const escrowAddress = await escrow.getAddress();
    await deed.connect(seller).approve(escrowAddress, propertyId);

    await expect(
      escrow.connect(seller).list(propertyId, price, deadline)
    )
      .to.emit(escrow, "Listed")
      .withArgs(propertyId, seller.address, price, deadline);

    const deal = await escrow.deals(propertyId);
    expect(deal.seller).to.equal(seller.address);
    expect(deal.price).to.equal(price);
    expect(deal.status).to.equal(1n); // Status.Listed
  });

  it("Should allow buyer to deposit full price", async function () {
    const propertyId = 1;
    const price = ethers.parseEther("1");
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    const escrowAddress = await escrow.getAddress();
    await deed.connect(seller).approve(escrowAddress, propertyId);
    await escrow.connect(seller).list(propertyId, price, deadline);

    await expect(
      escrow.connect(buyer).deposit(propertyId, { value: price })
    )
      .to.emit(escrow, "BuyerDeposit")
      .withArgs(propertyId, buyer.address, price);

    const deal = await escrow.deals(propertyId);
    expect(deal.buyer).to.equal(buyer.address);
    expect(deal.status).to.equal(2n); // Status.Funded
  });

  it("Should finalize after both confirmations", async function () {
    const propertyId = 1;
    const price = ethers.parseEther("1");
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    const escrowAddress = await escrow.getAddress();
    await deed.connect(seller).approve(escrowAddress, propertyId);
    await escrow.connect(seller).list(propertyId, price, deadline);
    await escrow.connect(buyer).deposit(propertyId, { value: price });

    await escrow.connect(buyer).buyerConfirm(propertyId);
    await escrow.connect(seller).sellerConfirm(propertyId);

    await expect(escrow.connect(buyer).finalize(propertyId))
      .to.emit(escrow, "Finalized")
      .withArgs(propertyId, seller.address, buyer.address, price);

    expect(await deed.ownerOf(propertyId)).to.equal(buyer.address);
  });

  it("Should refund buyer if deadline passes", async function () {
  const propertyId = 1;
  const price = ethers.parseEther("1");
  // set a proper future deadline (1 hour from now)
  const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

  const escrowAddress = await escrow.getAddress();
  await deed.connect(seller).approve(escrowAddress, propertyId);
  await escrow.connect(seller).list(propertyId, price, deadline);
  await escrow.connect(buyer).deposit(propertyId, { value: price });

  // Move time forward beyond the deadline
  await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
  await ethers.provider.send("evm_mine", []);

  await expect(escrow.connect(buyer).refund(propertyId))
    .to.emit(escrow, "Refunded")
    .withArgs(propertyId);
  expect(await deed.ownerOf(propertyId)).to.equal(seller.address);
});

  it("Seller can cancel before deposit", async function () {
    const propertyId = 1;
    const price = ethers.parseEther("1");
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 3600;

    const escrowAddress = await escrow.getAddress();
    await deed.connect(seller).approve(escrowAddress, propertyId);
    await escrow.connect(seller).list(propertyId, price, deadline);

    await expect(escrow.connect(seller).cancel(propertyId))
      .to.emit(escrow, "Cancelled")
      .withArgs(propertyId);

    expect(await deed.ownerOf(propertyId)).to.equal(seller.address);
  });
});