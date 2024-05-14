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
REFRESH_TOKEN_URL = "https://gateway.blum.codes/v1/auth/refresh"
BALANCE_URL = "https://game-domain.blum.codes/api/v1/user/balance"

# Function to read tokens from the file
def read_tokens(file_path):
    with open(file_path, 'r') as file:
        return [line.strip().split(',') for line in file]

# Function to get common headers with the current authorization token
def get_headers(auth_token):
    return {
        "accept": "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
        "authorization": f"Bearer {auth_token}",
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

# ... rest of the functions remain the same but include auth_token and ref_token as parameters

# Infinite loop with token validation and balance checking logic
def main_loop():
    while True:
        try:
            # Check if token is valid and refresh if needed
            if not is_token_valid():
                logger.warning("Token is invalid. Refreshing token...")
                refresh_token()

            # Check the balance and farming status
            balance_info = get_balance()
            farming_info = balance_info.get("farming")
            # If there is no farming information, skip
            if not farming_info:
                logger.warning("No farming information found. Skipping this iteration.")
                continue

            # Get current timestamp
            current_timestamp = int(time.time() * 1000)  # Convert to milliseconds

            # Check if endTime is less than or equal to the current timestamp
            end_time = farming_info.get("endTime")
            if end_time and end_time <= current_timestamp:
                logger.info("Farming session has ended. Claiming and restarting.")

                # Claim and start farming
                claim_response = claim_farming()
                logger.info(f"Claim Response: {claim_response}")

                start_response = start_farming()
                logger.info(f"Start Response: {start_response}")
            else:
                #print availableBalance and farming.balance and farming.endTime to human datetime
                end_time = farming_info.get("endTime")/ 1000  # Convert to seconds
                dt = datetime.fromtimestamp(end_time)
                formatted_date = dt.strftime("%y/%m.%d %H:%M:%S")
                logger.info(f"Farming is still in progress, user Balance : {balance_info['availableBalance']} - farm balance {farming_info['balance']} - next claim {formatted_date}")

            # Delay to avoid excessive requests
            time.sleep(60)

        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP-related error occurred: {e}")
            time.sleep(60)  # Delay before retrying

        except KeyboardInterrupt:
            logger.info("Script interrupted. Exiting...")
            break  # Exit when interrupted by user

        except Exception as e:
            logger.error(f"An unexpected error occurred: {e}")
            time.sleep(60)

# Run the script from the terminal
if __name__ == "__main__":
    token_pairs = read_tokens('token.txt')
    main_loop(token_pairs)  # Start the loop with the token pairs

