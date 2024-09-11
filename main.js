import {
  PrivateKey,
  TokenUpdateNftsTransaction,
  Client,
  TokenCreateTransaction,
  TokenMintTransaction,
  TokenType,
  TransactionId
} from "@hashgraph/sdk";
import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";

// Global state for wallet connection
let accountId = '';
let isConnected = false;

const hederaClient = Client.forName("testnet");

// Network configuration
const NETWORK_CONFIG = {
  testnet: {
    network: "testnet",
    jsonRpcUrl: "https://testnet.hedera.validationcloud.io/v1/GYSdi5Rlhc-NmoBLSVJGsqVQDOL6C4lCCQbyHc3NvsM",
    mirrorNodeUrl: "https://testnet.mirrornode.hedera.com",
    chainId: "0x128",
  },
};

const walletConnectProjectId = "377d75bb6f86a2ffd427d032ff6ea7d3";
const currentNetworkConfig = NETWORK_CONFIG.testnet;
const hederaNetwork = currentNetworkConfig.network;
const metadata = {
  name: "Hedera Vanilla JS",
  description: "Simple Hedera WalletConnect Integration",
  url: window.location.origin,
  icons: [window.location.origin + "/logo192.png"],
};

// Initialize WalletConnect
const dappConnector = new DAppConnector(
  metadata,
  hederaNetwork,
  walletConnectProjectId,
  Object.values(HederaJsonRpcMethod),
  [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
  [HederaChainId.Testnet]
);

// Ensure WalletConnect is initialized only once
let walletConnectInitPromise = undefined;
const initializeWalletConnect = async () => {
  if (walletConnectInitPromise === undefined) {
    walletConnectInitPromise = dappConnector.init();
  }
  await walletConnectInitPromise;
};

// Sync WalletConnect state and save to localStorage
function syncWalletconnectState() {
  const account = dappConnector.signers[0]?.getAccountId()?.toString();
  if (account) {
    accountId = account;
    isConnected = true;
    localStorage.setItem('accountId', accountId);
    localStorage.setItem('isConnected', 'true');
    updateAccountIdDisplay(accountId);
  } else {
    accountId = '';
    isConnected = false;
    localStorage.removeItem('accountId');
    localStorage.removeItem('isConnected');
    updateAccountIdDisplay("No account connected");
  }
}

// Restore state from localStorage on page load
const restoreSessionFromStorage = () => {
  const storedAccountId = localStorage.getItem('accountId');
  const storedIsConnected = localStorage.getItem('isConnected');

  if (storedAccountId && storedIsConnected === 'true') {
    accountId = storedAccountId;
    isConnected = true;
    updateAccountIdDisplay(accountId);
  }
}

// Open WalletConnect modal
const openWalletConnectModal = async () => {
  try {
    await initializeWalletConnect();
    if (!isConnected) {
      await dappConnector.openModal().then(() => {
        syncWalletconnectState();
      });
    } else {
      console.log("Already connected.");
    }
  } catch (error) {
    console.error("Failed to open WalletConnect modal", error);
  }
};

// Disconnect Wallet and clear localStorage
const disconnectWallet = async () => {
  if (isConnected) {
    try {
      await dappConnector.disconnectAll();
      isConnected = false;
      accountId = '';
      localStorage.removeItem('accountId');
      localStorage.removeItem('isConnected');
      syncWalletconnectState();
      console.log('Disconnected from wallet');
    } catch (error) {
      console.error("Failed to disconnect wallet", error);
    }
  } else {
    console.log("No active session to disconnect from.");
  }
};

// Update Account ID in DOM
function updateAccountIdDisplay(accountId) {
  const accountIdElement = document.getElementById("accountId");
  const disconnectButton = document.getElementById("disconnectButton");

  // Ensure the elements exist before trying to update them
  if (accountIdElement && disconnectButton) {
    if (accountId && accountId !== "No account connected") {
      accountIdElement.innerHTML = accountId;
      disconnectButton.innerHTML = `Connected - Click Button to disconnect`;
    } else {
      accountIdElement.innerHTML = "No account connected";
      disconnectButton.innerHTML = "Connect to WalletConnect";
    }
  } else {
    console.error("DOM elements for accountId or disconnectButton not found.");
  }
}

// Clear session on page load
const clearSessionOnLoad = () => {
  if (isConnected) {
    dappConnector.disconnectAll();
    isConnected = false;
    updateAccountIdDisplay("No account connected");
  }
}

  async function createNft() {
    const supplyKey = PrivateKey.generate(); 
    const metadataKey = PrivateKey.generate(); 
    const signer = dappConnector.signers[0];
    const tokenCreateTx = new TokenCreateTransaction()
      .setTokenName("TestToken")
      .setTokenSymbol("TEST")
      .setTokenType(TokenType.NonFungibleUnique)
      .setTreasuryAccountId(accountId)
      .setAutoRenewAccountId(accountId)
      .setAutoRenewPeriod(7776000)
      .setSupplyKey(supplyKey.publicKey)
      .setMetadataKey(metadataKey.publicKey)
      .setTransactionId(TransactionId.generate(accountId));

      const txResult = await tokenCreateTx.executeWithSigner(signer);
      const nftCreateRx = await txResult.getReceipt(hederaClient);
      const tokenId = nftCreateRx.tokenId;
      console.log("NFT created! Token Id" + tokenId)
      console.log("MetadataKey:" + metadataKey)
      return { tokenId, metadataKey, supplyKey };
  }

  async function mintNft(tokenId, supplyKey) {
    const signer = dappConnector.signers[0];
    const metadataBytes = new TextEncoder().encode("QmbokN1onYuUHCUagbUApmd3zsw2xgN1yoJ8ouHnb1qApu");
    const tokenMintTx = await new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadataBytes) 

    await tokenMintTx.freezeWithSigner(signer);
    console.log("Signing NFT with MetadataKey....")
    const signedTokenMintTx = await tokenMintTx.sign(supplyKey);
    console.log("NFT signed!")

    const txResult = await signedTokenMintTx.executeWithSigner(signer);
    const nftMintRx = await txResult.getReceipt(hederaClient);
    const supply = nftMintRx.totalSupply;
    console.log(`NFT minted with TokenId: ${tokenId}. New total supply is ${supply}`);
    return txResult ? txResult.transactionId : null;
  }

async function metadataUpdate(tokenId, serialNumber, newMetadata, metadataKey) {
  const signer = dappConnector.signers[0];
  const newMetadataUri = new TextEncoder().encode(newMetadata)

  try {
    const updateTransaction = new TokenUpdateNftsTransaction()
      .setTokenId(tokenId) 
      .setSerialNumbers([serialNumber]) 
      .setMetadata(new TextEncoder().encode(newMetadataUri)) 

    await updateTransaction.freezeWithSigner(signer);
    const signedUpdateTx = await updateTransaction.sign(metadataKey);
    const txResult = await signedUpdateTx.executeWithSigner(signer);
    console.log(`Metadata for Token ${tokenId} updated successfully.`);
  } catch (error) {
    console.error(`Failed to update metadata: ${error.message}`);
  }
}

async function handleRunTest() {
  try {
    const newMetadata = document.getElementById('newMetadata').value;

    // Create the NFT and get tokenId and metadataKey
    console.log("Creating NFT...");
    const { tokenId, metadataKey, supplyKey } = await createNft();

    // Mint the NFT using the tokenId from the create step
    console.log("Minting NFT...");
    const serialNumber = await mintNft(tokenId, supplyKey);

    // Update the metadata after minting the NFT
    console.log("Updating metadata...");
    await metadataUpdate(tokenId, serialNumber, newMetadata, metadataKey);

    console.log("NFT creation, minting, and metadata update completed successfully.");
  } catch (error) {
    console.error("Error during the NFT creation and update process:", error);
  }
}

// Ensure the DOM is fully loaded before attaching event listeners
document.addEventListener('DOMContentLoaded', async () => {
  await initializeWalletConnect();

  // Restore session from localStorage
  restoreSessionFromStorage();

  // Ensure the buttons exist before adding event listeners
  const disconnectButton = document.getElementById('disconnectButton');
  const updateButton = document.getElementById('updateButton');

  if (disconnectButton) {
    disconnectButton.addEventListener('click', () => {
      if (isConnected) {
        disconnectWallet();
      } else {
        openWalletConnectModal();
      }
    });
  }

  // Attach the token metadata update event listener
  if (updateButton) {
    updateButton.addEventListener('click', handleRunTest);
  }
});
