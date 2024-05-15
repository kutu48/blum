import sys
import time
import requests
from loguru import logger
from datetime import datetime

# Configure Loguru with the desired format and colorization
logger.remove()  # Remove default handler
logger.add(
    sys.stdout,
    format=(
        "<white>{time:YYYY-MM-DD HH:mm:ss}</white>"
        " | <level>{level: <8}</level>"
        " | <cyan><b>{line}</b></cyan>"
        " - <white><b>{message}</b></white>"
    ),
    colorize=True,  # Enable colored output
)

# Base URLs
BASE_URL = "https://game-domain.blum.codes/api/v1/farming"
USER_CHECK_URL = "https://gateway.blum.codes/v1/user/me"
BALANCE_URL = "https://game-domain.blum.codes/api/v1/user/balance"
CLAIM_FRIENDS_URL = "https://gateway.blum.codes/v1/friends/claim"

# Function to get common headers with the current authorization token
def get_headers(auth_token):
    return {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en=q=0.8",
        "authorization": "Bearer "+auth_token,
        "origin": "https://telegram.blum.codes",
        "referer": "https://telegram.blum.codes/",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "macOS",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    }

# Function to read auth_token from token.txt file for two accounts
def read_tokens_from_file():
    tokens = []
    with open("token.txt", "r") as file:
        for line in file:
            tokens.append(line.strip())
    return tokens

# Read tokens from file
tokens = read_tokens_from_file()

# Global variable to store the authentication token for each account
auth_tokens = {f"account_{i+1}": tokens[i] for i in range(len(tokens))}

# Function to check if the token is valid
def is_token_valid(auth_token):
    headers = get_headers(auth_token)
    response = requests.get(USER_CHECK_URL, headers=headers)
    
    if response.status_code == 200:
        return True
    elif response.status_code == 401:
        # Check if the error code in the response indicates invalid token
        error_info = response.json()
        return error_info.get("code") != 16
    else:
        return False

# Function to claim farming rewards
def claim_farming(auth_token):
    url = f"{BASE_URL}/claim"
    headers = get_headers(auth_token)  # Get headers with updated token
    response = requests.post(url, headers=headers)
    response.raise_for_status()
    return response.json()

# Function to start farming
def start_farming(auth_token):
    url = f"{BASE_URL}/start"
    headers = get_headers(auth_token)
    response = requests.post(url, headers=headers)
    response.raise_for_status()
    return response.json()

# Function to claim friends rewards
def claim_friends(auth_token):
    headers = get_headers(auth_token)  # Get headers with updated token
    response = requests.post(CLAIM_FRIENDS_URL, headers=headers)
    response.raise_for_status()
    return response.json()

# Function to get the current balance and farming status
def get_balance(auth_token):
    headers = get_headers(auth_token)  # Get headers with updated token
    response = requests.get(BALANCE_URL, headers=headers)
    response.raise_for_status()  # Raises exception if not 2xx
    return response.json()

# Infinite loop with token validation, balance checking, and claiming logic
def main_loop(account):
    last_friends_claim_time = 0  # Initialize last claim time to 0
    while True:
        try:
            auth_token = auth_tokens[account]

            # Check if token is valid
            if not is_token_valid(auth_token):
                logger.warning("Token is invalid. Exiting...")
                break

            # Check the balance and farming status
            balance_info = get_balance(auth_token)
            farming_info = balance_info.get("farming")
            # If there is no farming information, skip
            if not farming_info:
                logger.warning("No farming information found. Skipping this iteration.")
                continue

            # Get current timestamp
            current_timestamp = int(time.time() * 1000)  # Convert to milliseconds

            # Check if it's time to claim friends rewards (every 12 hours)
            if current_timestamp - last_friends_claim_time >= 12 * 60 * 60 * 1000:
                logger.info("Claiming friends rewards...")
                claim_friends_response = claim_friends(auth_token)
                logger.info(f"Friends Claim Response: {claim_friends_response}")
                last_friends_claim_time = current_timestamp  # Update last claim time

            # Check if endTime is less than or equal to the current timestamp
            end_time = farming_info.get("endTime")
            if end_time and end_time <= current_timestamp:
                logger.info("Farming session has ended. Claiming and restarting.")

                # Claim and start farming
                claim_response = claim_farming(auth_token)
                logger.info(f"Claim Response: {claim_response}")

                start_response = start_farming(auth_token)
                logger.info(f"Start Response: {start_response}")
            else:
                #print availableBalance and farming.balance and farming.endTime to human datetime
                end_time = farming_info.get("endTime")/ 1000  # Convert to seconds
                dt = datetime.fromtimestamp(end_time)
                formatted_date = dt.strftime("%y/%m.%d %H:%M:%S")
                logger.info(f"Farming is still in progress, user Balance : {balance_info['availableBalance']} - farm balance {farming_info['balance']} - next claim {formatted_date}")

                # Calculate time to wait until next claim
                time_to_wait = (end_time - current_timestamp) / 1000  # Convert to seconds
                time.sleep(time_to_wait)  # Sleep until next claim time
        except Exception as e:
            logger.error(f"An error occurred: {e}")
            time.sleep(60)  # Wait for a minute before retrying

# Example usage
if __name__ == "__main__":
    # You can change the account name to "account_2" for the second account
    main_loop("account_1")
