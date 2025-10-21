import { network } from "hardhat"; 
import { expect } from "chai"; 
const {ethers} = await network.connect();
import { Contract } from "ethers";


async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy PropertyDeed
  const Deed = await ethers.getContractFactory("PropertyDeed");
  const deed = await Deed.deploy();
  await deed.waitForDeployment();

  const deedAddress = await deed.getAddress();
  console.log("PropertyDeed deployed at:", deedAddress);

  // Deploy PropertyEscrow
  const Escrow = await ethers.getContractFactory("PropertyEscrow");
  const escrow = await Escrow.deploy(deedAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("PropertyEscrow deployed at:", escrowAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
