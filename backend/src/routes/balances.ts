'use client'

import { Router, Request, Response } from 'express';
import { ethers }                    from 'ethers';
import { readWalletData }            from '../chain/papiReader.js';

export const balancesRouter = Router();

// We keep these for reference, but PAPI is our primary now
const RPC_URL        = process.env.RPC_URL ?? 'https://services.polkadothub-rpc.com/testnet';
const CHAIN_ID       = 420420417;

balancesRouter.get('/:address', async (req: Request, res: Response) => {
  const address = req.params.address;

  if (!ethers.isAddress(address)) {
    res.status(400).json({ success: false, error: 'Invalid EVM address' });
    return;
  }

  try {
    // 1. Use PAPI first - It's 10x faster because it uses WebSockets
    console.log(`[balances] Quick fetching via PAPI for ${address}...`);
    const chainData = await readWalletData(address);
    
    const usdt = Number(chainData.usdtBalance) / 1e6;
    const usdc = Number(chainData.usdcBalance) / 1e6;

    // If PAPI worked (which it should), return immediately!
    res.json({ 
      success: true, 
      usdt, 
      usdc, 
      source: 'papi',
      ss58: chainData.address 
    });

  } catch (err) {
    console.warn('[balances] PAPI failed, trying slow EVM fallback:', err);
    
    // 2. Slow Fallback to EVM only if PAPI fails
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name:    'polkadot-testnet',
}, { staticNetwork: true });

      
      const USDT_PRECOMPILE = '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF07C0';
      const contract = new ethers.Contract(USDT_PRECOMPILE, ['function balanceOf(address) view returns (uint256)'], provider);
      
      // Set a strict timeout so it doesn't hang the UI
      const usdtRaw = await Promise.race([
        contract.balanceOf(address),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]) as bigint;

      res.json({ 
        success: true, 
        usdt: Number(usdtRaw) / 1e6, 
        usdc: 0, 
        source: 'eth_call_fallback' 
      });
    } catch (fallbackErr) {
      res.status(500).json({ success: false, error: 'Both balance sources failed' });
    }
  }
});
