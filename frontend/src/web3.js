// frontend/src/web3.js
import { ethers } from "ethers";
import deedAbi from "./abi/PropertyDeed.json";
import escrowAbi from "./abi/PropertyEscrow.json";
import { DEFAULT_DEED, DEFAULT_ESCROW, CHAIN_ID } from "./address";

// Optional: make sure the user is on the expected chain (1337 Ganache)
export async function ensureChain() {
  if (!window.ethereum) return;
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== Number(CHAIN_ID)) {
      // 1337 in hex is 0x539
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x539" }],
      });
    }
  } catch (err) {
    // If the chain is not added, you could add it (Ganache example)
    // but usually switching is enough for local dev.
    console.warn("ensureChain:", err);
  }
}

export async function getProvider() {
  if (!window.ethereum) throw new Error("MetaMask not found");
  await ensureChain();
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const provider = await getProvider();
  await provider.send("eth_requestAccounts", []);
  return await provider.getSigner();
}

// If you need a read-only provider (no wallet prompt)
export async function getReadProvider() {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  // fallback: local RPC (adjust if your Ganache runs elsewhere)
  return new ethers.JsonRpcProvider("http://127.0.0.1:7545");
}

/**
 * getDeedContract
 * @param {string} address optional override (otherwise uses DEFAULT_DEED)
 */
export async function getDeedContract(address) {
  const signer = await getSigner();
  const abi = deedAbi.abi || deedAbi; // supports artifact or pure ABI
  const addr = address || DEFAULT_DEED;
  if (!addr) throw new Error("Deed address missing");
  return new ethers.Contract(addr, abi, signer);
}

/**
 * getEscrowContract
 * @param {string} address optional override (otherwise uses DEFAULT_ESCROW)
 */
export async function getEscrowContract(address) {
  const signer = await getSigner();
  const abi = escrowAbi.abi || escrowAbi;
  const addr = address || DEFAULT_ESCROW;
  if (!addr) throw new Error("Escrow address missing");
  return new ethers.Contract(addr, abi, signer);
}

export async function assertContractCode(address) {
  const p = await getReadProvider();
  const code = await p.getCode(address);
  if (!code || code === '0x') {
    throw new Error(`No contract code at ${address} on this network`);
  }
}

export function fnList(escrow) {
  if (typeof escrow.list === 'function') return 'list';
  throw new Error('ABI mismatch: list() not found on escrow');
}

// export “defaults” for components that want to read them
export const DEFAULT_DEED_ADDRESS = DEFAULT_DEED;
export const DEFAULT_ESCROW_ADDRESS = DEFAULT_ESCROW;
