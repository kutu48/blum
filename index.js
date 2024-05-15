const axios = require('axios');
const { DateTime } = require('luxon');
const schedule = require('node-schedule');
const { log } = require('@loguru');

log.remove(); // Remove default handler
log.add(
  log.ConsoleSink({
    format: "<white>{time:YYYY-MM-DD HH:mm:ss}</white> | <level>{level: <8}</level> | <cyan><b>{line}</b></cyan> - <white><b>{message}</b></white>",
    colorize: true
  })
);

// Base URLs
const BASE_URL = "https://game-domain.blum.codes/api/v1/farming";
const USER_CHECK_URL = "https://gateway.blum.codes/v1/user/me";
const BALANCE_URL = "https://game-domain.blum.codes/api/v1/user/balance";

// Function to get common headers with the current authorization token
function getHeaders(authToken) {
  return {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-GB,en-US;q=0.9,en=q=0.8",
    "authorization": "Bearer " + authToken,
    "origin": "https://telegram.blum.codes",
    "referer": "https://telegram.blum.codes/",
    "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120", "Microsoft Edge WebView2";v="120",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "Windows",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"
  };
}

// Function to read auth token from token.txt file for two accounts
function readTokensFromFile() {
  const fs = require('fs');
  const tokens = fs.readFileSync("token.txt", "utf8").split("\n").map(token => token.trim());
  return tokens;
}

// Read tokens from file
const tokens = readTokensFromFile();

// Global variable to store the authentication token for each account
const authTokens = tokens.reduce((acc, token, index) => {
  acc[`account_${index + 1}`] = token;
  return acc;
}, {});

// Function to check if the token is valid
async function isTokenValid(authToken) {
  const headers = getHeaders(authToken);
  try {
    const response = await axios.get(USER_CHECK_URL, { headers });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

// Function to claim farming rewards
async function claimFarming(authToken) {
  const url = `${BASE_URL}/claim`;
  const headers = getHeaders(authToken);
  const response = await axios.post(url, {}, { headers });
  return response.data;
}

// Function to start farming
async function startFarming(authToken) {
  const url = `${BASE_URL}/start`;
  const headers = getHeaders(authToken);
  const response = await axios.post(url, {}, { headers });
  return response.data;
}

// Function to get the current balance and farming status
async function getBalance(authToken) {
  const headers = getHeaders(authToken);
  const response = await axios.get(BALANCE_URL, { headers });
  return response.data;
}

// Infinite loop with token validation, balance checking, claiming, and switching accounts logic
async function mainLoop(account) {
  let accountIndex = parseInt(account.split("_")[1]) - 1;
  const numAccounts = Object.keys(authTokens).length;

  while (true) {
    try {
      const authToken = authTokens[account];

      // Check if token is valid
      if (!(await isTokenValid(authToken))) {
        log.warning("Token is invalid. Exiting...");
        break;
      }

      // Check the balance and farming status
      const balanceInfo = await getBalance(authToken);
      const farmingInfo = balanceInfo.farming;

      // If there is no farming information, skip
      if (!farmingInfo) {
        log.warning("No farming information found. Switching to the next account.");
        // Switch to the next account
        accountIndex = (accountIndex + 1) % numAccounts;
        account = `account_${accountIndex + 1}`;
        log.info(`Switched to account: ${account}`);
        continue;
      }

      // Get current timestamp
      const currentTimestamp = new Date().getTime();

      // Check if endTime is less than or equal to the current timestamp
      const endTime = farmingInfo.endTime;
      if (endTime && endTime <= currentTimestamp) {
        log.info("Farming session has ended. Claiming and switching to the next account.");

        // Claim farming rewards
        const claimResponse = await claimFarming(authToken);
        log.info(`Claim Response: ${claimResponse}`);

        // Switch to the next account
        accountIndex = (accountIndex + 1) % numAccounts;
        account = `account_${accountIndex + 1}`;
        log.info(`Switched to account: ${account}`);

        // Start farming on the new account
        const startResponse = await startFarming(authToken);
        log.info(`Start Response: ${startResponse}`);

        // Wait for 1 hour before checking the next account
        await new Promise(resolve => setTimeout(resolve, 3600000)); // 1 hour in milliseconds
      } else {
        // Print availableBalance and farming.balance and farming.endTime to human datetime
        const endDateTime = DateTime.fromMillis(endTime);
        const formattedDate = endDateTime.toFormat("yy/MM/dd HH:mm:ss");
        log.info(`Farming is still in progress, user Balance : ${balanceInfo.availableBalance} - farm balance ${farmingInfo.balance} - next claim ${formattedDate}`);

        // Calculate time to wait until next claim
        const timeToWait = Math.max((endTime - currentTimestamp) / 1000, 0); // Convert to seconds and ensure it's not negative
        await new Promise(resolve => setTimeout(resolve, timeToWait * 1000)); // Sleep until next claim time
      }
    } catch (error) {
      log.error(`An error occurred: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for a minute before retrying
    }
  }
}

// Function to print farming info every 1 minute
function printFarmingInfo() {
  try {
    const authToken = authTokens[account];

    // Check the balance and farming status
    getBalance(authToken)
      .then(balanceInfo => {
        const farmingInfo = balanceInfo.farming;

        if (farmingInfo) {
          // Print farming info
          const balance = balanceInfo.availableBalance;
          const farmBalance = farmingInfo.balance;
          const nextClaim = DateTime.fromMillis(farmingInfo.endTime).toFormat("yy/MM/dd HH:mm:ss");
          const message = `Farming is still in progress, user Balance: ${balance} - farm balance ${farmBalance} - next claim ${nextClaim}`;
          log.info(message);
        } else {
          log.warning("No farming information found.");
        }
      })
      .catch(error => {
        log.error(`An error occurred while printing farming info: ${error.message}`);
      });
  } catch (error) {
    log.error(`An error occurred while printing farming info: ${error.message}`);
  }
}

// Schedule the printing every 1 minute
schedule.scheduleJob('* * * * *', () => {
  printFarmingInfo();
});

// Example usage
if (require.main === module) {
  // You can change the account name to "account_2" for the second account
  mainLoop("account_1");
}
