import type { HardhatUserConfig } from "hardhat/config";

import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";

import * as dotenv from "dotenv";
dotenv.config();

import "@nomicfoundation/hardhat-viem";
import "@nomicfoundation/hardhat-ethers";

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
solidity: {
  version: "0.8.28",
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london" // <-- Ganache-compatible
  }
},
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    ganache: {
      type: "http",
      url: 'http://127.0.0.1:7545' ,
      accounts: ['0x7150915fac91aafe7e618368bedfc845eb57e53131b220815cd216f46d4ad503','0xa3c114ddb7f171a95b04d90af6d8f06b28f9b43eb46243ca3a8bab7de83fd0aa']
    },
  },
};

export default config;
