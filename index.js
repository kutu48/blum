const axios = require('axios');
const { DateTime } = require('luxon');

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
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "macOS",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };
}

// Function to read auth_token from token.txt file for two accounts
function readTokensFromFile() {
    // Implement reading tokens from file
}

// Global variable to store the authentication token for each account
const authTokens = readTokensFromFile();

// Function to check if the token is valid
async function isTokenValid(authToken) {
    try {
        const headers = getHeaders(authToken);
        const response = await axios.get(USER_CHECK_URL, { headers });
        return response.status === 200;
    } catch (error) {
        if (error.response && error.response.status === 401) {
            // Check if the error code in the response indicates invalid token
            const errorCode = error.response.data.code;
            return errorCode !== 16;
        }
        return false;
    }
}

// Function to claim farming rewards
async function claimFarming(authToken) {
    const url = `${BASE_URL}/claim`;
    const headers = getHeaders(authToken);
    const response = await axios.post(url, null, { headers });
    return response.data;
}

// Function to start farming
async function startFarming(authToken) {
    const url = `${BASE_URL}/start`;
    const headers = getHeaders(authToken);
    const response = await axios.post(url, null, { headers });
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
    const accountIndex = parseInt(account.split("_")[1]) - 1;
    const numAccounts = Object.keys(authTokens).length;

    while (true) {
        try {
            const authToken = authTokens[account];

            // Check if token is valid
            if (!(await isTokenValid(authToken))) {
                console.log("Token is invalid. Exiting...");
                break;
            }

            // Check the balance and farming status
            const balanceInfo = await getBalance(authToken);
            const farmingInfo = balanceInfo.farming;

            if (!farmingInfo) {
                console.log("No farming information found. Skipping this iteration.");
                continue;
            }

            const currentTimestamp = Date.now();

            const endTime = farmingInfo.endTime;
            if (endTime && endTime <= currentTimestamp) {
                console.log("Farming session has ended. Claiming and switching to the next account.");

                // Claim farming rewards
                const claimResponse = await claimFarming(authToken);
                console.log("Claim Response:", claimResponse);

                // Switch to the next account
                const nextAccountIndex = (accountIndex + 1) % numAccounts;
                account = `account_${nextAccountIndex + 1}`;
                const nextAuthToken = authTokens[account];
                console.log("Switched to account:", account);

                // Start farming on the new account
                const startResponse = await startFarming(nextAuthToken);
                console.log("Start Response:", startResponse);
            } else {
                const formattedDate = DateTime.fromMillis(endTime).toFormat("yy/MM/dd HH:mm:ss");
                console.log(`Farming is still in progress, user Balance: ${balanceInfo.availableBalance} - farm balance ${farmingInfo.balance} - next claim ${formattedDate}`);

                // Calculate time to wait until next claim
                const timeToWait = Math.max((endTime - currentTimestamp) / 1000, 0);
                await new Promise(resolve => setTimeout(resolve, timeToWait * 1000));
            }
        } catch (error) {
            console.error("An error occurred:", error);
            await new Promise(resolve => setTimeout(resolve, 60000)); // Wait for a minute before retrying
        }
    }
}

// Example usage
if (require.main === module) {
    // You can change the account name to "account_2" for the second account
    mainLoop("account_1");
}
