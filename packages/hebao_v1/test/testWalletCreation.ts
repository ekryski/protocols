import {
  Context,
  getContext,
  createContext,
  executeTransaction,
  toAmount,
  getEnsApproval
} from "./helpers/TestUtils";
import { transferFrom } from "./helpers/TokenUtils";
import { assertEventEmitted, assertNoEventEmitted } from "../util/Events";
import { expectThrow } from "../util/expectThrow";
import BN = require("bn.js");
import { Constants } from "./helpers/Constants";
import { sign } from "./helpers/Signature";
import { signCreateWallet } from "./helpers/SignatureUtils";

contract("WalletFactory", () => {
  let defaultCtx: Context;
  let ctx: Context;

  let useMetaTx: boolean = false;
  const walletDomain = ".loopring.eth";

  const createWalletChecked = async (
    owner: string,
    walletName: string = "",
    ensRegisterReverse: boolean = true
  ) => {
    const wallet = await ctx.walletFactory.computeWalletAddress(owner, 0);

    if (useMetaTx) {
      // Transfer 0.1 ETH to the wallet to pay for the wallet creation
      await transferFrom(ctx, owner, wallet, "ETH", toAmount("0.1"));
    }

    const modules = [
      ctx.finalSecurityModule.address,
      ctx.finalTransferModule.address,
      ctx.finalCoreModule.address
    ];

    const signer = ctx.owners[0];
    const ensApproval = await getEnsApproval(wallet, walletName, signer);
    const txSignature = signCreateWallet(
      ctx.walletFactory.address,
      owner,
      0,
      walletName,
      ensApproval,
      ensRegisterReverse,
      modules
    );

    const opt = useMetaTx
      ? { owner, wallet, gasPrice: new BN(1) }
      : { from: owner };

    const tx = await executeTransaction(
      ctx.walletFactory.contract.methods.createWallet(
        owner,
        0,
        walletName,
        ensApproval,
        ensRegisterReverse,
        modules,
        txSignature
      ),
      ctx,
      useMetaTx,
      wallet,
      [],
      opt
    );

    await assertEventEmitted(
      ctx.walletFactory,
      "WalletCreated",
      (event: any) => {
        return event.wallet === wallet && event.owner === owner;
      }
    );

    if (walletName !== "") {
      await assertEventEmitted(
        ctx.baseENSManager,
        "Registered",
        (event: any) => {
          return (
            event._ens === walletName + walletDomain && event._owner === wallet
          );
        }
      );
    } else {
      await assertNoEventEmitted(ctx.baseENSManager, "Registered");
    }

    const walletContract = await ctx.contracts.WalletImpl.at(wallet);
    assert.equal(await walletContract.owner(), owner, "wallet owner incorrect");

    if (!useMetaTx) {
      // Try to create the wallet again
      await expectThrow(
        executeTransaction(
          ctx.walletFactory.contract.methods.createWallet(
            owner,
            0,
            walletName,
            ensApproval,
            ensRegisterReverse,
            modules,
            txSignature
          ),
          ctx,
          useMetaTx,
          wallet,
          [],
          { owner, wallet, from: owner, gasPrice: new BN(1) }
        ),
        useMetaTx ? "UNAUTHORIZED" : "CREATE2_FAILED"
      );
    }
  };

  const registerENSChecked = async (owner: string, walletName: string = "") => {
    const wallet = await ctx.walletFactory.computeWalletAddress(owner, 0);

    const signer = ctx.owners[0];
    const ensApproval = await getEnsApproval(wallet, walletName, signer);

    const opt = { owner, wallet, gasPrice: new BN(1) };

    const tx = await executeTransaction(
      ctx.walletFactory.contract.methods.registerENS(
        wallet,
        walletName,
        ensApproval
      ),
      ctx,
      useMetaTx,
      wallet,
      [],
      opt
    );

    if (walletName !== "") {
      await assertEventEmitted(
        ctx.baseENSManager,
        "Registered",
        (event: any) => {
          return (
            event._ens === walletName + walletDomain && event._owner === wallet
          );
        }
      );
    } else {
      await assertNoEventEmitted(ctx.baseENSManager, "Registered");
    }
  };

  const description = (descr: string, metaTx: boolean = useMetaTx) => {
    return descr + (metaTx ? " (meta tx)" : "");
  };

  before(async () => {
    defaultCtx = await getContext();
  });

  beforeEach(async () => {
    ctx = await createContext(defaultCtx);
  });

  [false, true].forEach(function(metaTx) {
    it(
      description("user should be able to create a wallet without ENS", metaTx),
      async () => {
        useMetaTx = metaTx;
        await createWalletChecked(ctx.owners[0]);
        await registerENSChecked(
          ctx.owners[0],
          "testwallet" + new Date().getTime()
        );
      }
    );

    it(
      description("user should be able to create a wallet with ENS", metaTx),
      async () => {
        useMetaTx = metaTx;
        await createWalletChecked(
          ctx.owners[0],
          "mywallet" + (useMetaTx ? "a" : "b")
        );
      }
    );
  });
});
