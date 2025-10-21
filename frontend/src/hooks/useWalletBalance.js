// src/hooks/useWalletBalance.js
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";

const TARGET_CHAIN = (process.env.REACT_APP_CHAIN_ID || "").toLowerCase();

function useWalletBalance() {
  const [address, setAddress]   = useState("");
  const [balanceWei, setBalWei] = useState(0n);
  const [chainId, setChainId]   = useState("");
  const [connecting, setConn]   = useState(true);

  const backoffRef   = useRef(0);
  const timerRef     = useRef(null);
  const refreshRef   = useRef(async () => {}); // will be assigned after refresh is defined

  const balanceEth = useMemo(() => {
    try { return ethers.formatEther(balanceWei); } catch { return "0.0"; }
  }, [balanceWei]);

  const scheduleNext = useCallback((ms) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void refreshRef.current(); }, ms);
  }, []); // no missing deps now

  const refresh = useCallback(async () => {
    if (!window.ethereum || !address) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const [bal, cid] = await Promise.all([
        provider.getBalance(address),
        window.ethereum.request({ method: "eth_chainId" }),
      ]);
      setBalWei(bal);
      setChainId((cid || "").toLowerCase());
      backoffRef.current = 0;
      scheduleNext(10_000);
    } catch (e) {
      console.warn("getBalance failed; backing off:", e?.message || e);
      backoffRef.current = Math.min(backoffRef.current ? backoffRef.current * 2 : 2000, 60000);
      scheduleNext(backoffRef.current);
    }
  }, [address, scheduleNext]);

  // keep ref in sync so scheduleNext can call the latest refresh
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  // initial address
  useEffect(() => {
    (async () => {
      if (!window.ethereum) { setConn(false); return; }
      try {
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        setAddress(accounts?.[0] || "");
      } finally { setConn(false); }
    })();
  }, []);

  // MM events
  useEffect(() => {
    if (!window.ethereum) return;
    const onAcc   = (accs) => setAddress(accs?.[0] || "");
    const onChain = (cid)  => setChainId(String(cid || "").toLowerCase());
    window.ethereum.on("accountsChanged", onAcc);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAcc);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, []);

  // refresh when address changes
  useEffect(() => {
    clearTimeout(timerRef.current);
    if (address) refresh();
    return () => clearTimeout(timerRef.current);
  }, [address, refresh]);

  const wrongNetwork = TARGET_CHAIN && chainId && chainId !== TARGET_CHAIN;
  return { address, balanceWei: balanceWei, balanceEth, chainId, wrongNetwork, connecting, refresh };
}
export default useWalletBalance