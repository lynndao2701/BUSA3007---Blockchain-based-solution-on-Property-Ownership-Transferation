import { network } from "hardhat"; 
import { expect } from "chai"; 
const {ethers} = await network.connect();
import { Contract } from "ethers";

async function main() {
    console.log("🚀 Starting PropertyDeed + PropertyEscrow Test...");
    
    const deedAddress = "0x8c891c564deEad7188C8F41ab7556CB6BF2FC5b6";
    const escrowAddress = "0x38d9aA6405ace235EcD8D3Ec60f7dBB82f00dd88";
  // Print all available signers
    const signers = await ethers.getSigners();
    console.log("Available accounts:");
    signers.forEach((s, i) => {
    console.log(`Signer[${i}]: ${s.address}`);
  });

  // Pick seller and buyer from the list
    const seller = signers[0];
    const buyer = signers[1]; // make sure different accounts

    console.log("Selected Seller:", seller.address);
    console.log("Selected Buyer:", buyer.address);

    const PropertyDeed = await ethers.getContractFactory("PropertyDeed");
    const deed = await PropertyDeed.attach(deedAddress);

    const PropertyEscrow = await ethers.getContractFactory("PropertyEscrow");
    const escrow = await PropertyEscrow.attach(escrowAddress);

    const price = ethers.parseEther("2"); // 1 ETH
    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

 // --------------------------
  // Mint unique deed to seller
  // --------------------------
  await deed.connect(seller).mintDeed(
    seller.address,
    "https://ipfs.io/ipfs/sample-property-metadata.json"
  );
  const tokenId = await deed.getCurrentTokenId();
  console.log(`✅ Deed minted to seller (${seller.address}) with tokenId: ${tokenId}`);

  // --------------------------
  // Approve escrow
  // --------------------------
  await deed.connect(seller).approve(await escrow.getAddress(), tokenId);
  console.log(`✅ Escrow approved to manage deed #${tokenId}`);

  // --------------------------
  // Seller lists property
  // --------------------------
  await escrow.connect(seller).list(tokenId, price, deadline);
  console.log(`✅ Property #${tokenId} listed for ${ethers.formatEther(price)} ETH`);

  // --------------------------
  // Buyer deposits
  // --------------------------
  await escrow.connect(buyer).deposit(tokenId, { value: price });
  console.log(`✅ Buyer deposited ${ethers.formatEther(price)} ETH for property #${tokenId}`);

  // --------------------------
  // Buyer confirms
  // --------------------------
  await escrow.connect(buyer).buyerConfirm(tokenId);
  console.log(`✅ Buyer confirmed property #${tokenId}`);

  // --------------------------
  // Seller confirms
  // --------------------------
  await escrow.connect(seller).sellerConfirm(tokenId);
  console.log(`✅ Seller confirmed property #${tokenId}`);

  // --------------------------
  // Finalize transaction
  // --------------------------
  await escrow.connect(seller).finalize(tokenId);
  console.log(`✅ Transaction finalized for property #${tokenId}`);

  // --------------------------
  // Verify new ownership
  // --------------------------
  const newOwner = await deed.ownerOf(tokenId);
  console.log(`🏠 New owner of property #${tokenId} is: ${newOwner}`);
  expect(newOwner).to.equal(buyer.address);
}

main().catch((error) => {
  console.error("❌ Error running test:", error);
  process.exitCode = 1;
});