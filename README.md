# Aetheric Message Receiver & Validator

This project contains two main applications:

- **Receiver:** Connects to the Aetheric Engine, receives ASCII and binary messages, and stores them in a SQLite database and a spool directory.
- **Validator:** Validates the integrity and correctness of the data collected by the receiver.

---

## Features

- Connects to a remote TCP server using JWT authentication
- Receives and parses ASCII and binary messages
- Stores ASCII messages and binary payload metadata in SQLite
- Spools large binary payloads to disk before finalizing in the database
- Handles disk space checks and discards oversized binary payloads safely
- Logs and tracks discarded payloads for auditing
- Validates stored data for integrity and completeness

---

## Requirements

- Node.js 20.x (for development)
- npm
- Docker (for containerized application runs)

---

## Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/chrisdoctor/message-receiver-app.git
   cd message-receiver-app
   ```

2. **Install dependencies (for CLI/dev use):
    ```sh
    npm install
    ```

---

## Environment Variables
Create a .env file in the project root. Example:

```sh
AE_HOST=aetheric.engine.host
AE_PORT=8080
AE_JWT=your-jwt-token
SQLITE_PATH=./sqlite-db/ae.db
BINARY_SPOOL_DIR=./data/bin
VALIDATOR_REPORT_FOLDER=./report
```

### Aetheric Engine
* **`AE_HOST`**: Host address for the Aetheric Engine.
* **`AE_PORT`**: Port number for the Aetheric Engine.
* **`AE_JWT`**: JSON Web Token for authentication.

### Database & Files
* **`SQLITE_PATH`**: Path to the SQLite database file.
* **`BINARY_SPOOL_DIR`**: Directory for temporary binary spool files.
* **`VALIDATOR_REPORT_FOLDER`**: Directory for validator output reports.

---

## Running the Receiver
From CLI (Development)
```sh
npm run dev
```

With Docker (Production)
1. **Build the Docker image:**
```sh
docker build -t aetheric-node .
```

2. **Run the container:**
```sh
docker run --rm \
  -v $(pwd)/sqlite-db:/app/sqlite-db \
  -v $(pwd)/data/bin:/app/data/bin \
  -v $(pwd)/report:/app/report \
  --env-file .env \
  aetheric-node
```

* The receiver will run, and after it exits, the validator will automatically run inside the container.

---

## Running the Validator
From CLI (Development)
After collecting data, you can run the validator manually:
```sh
npm run build
npm run validate:full
```

With Docker
The validator runs automatically after the receiver in the Docker workflow.
To run it separately:
```sh
docker run --rm \
  -v $(pwd)/sqlite-db:/app/sqlite-db \
  -v $(pwd)/report:/app/report \
  --env-file .env \
  aetheric-node npm run validate:full
```

---

## Notes
* When using Docker, do not run `npm install` **locally** before building the image. The Docker build will install dependencies inside the container.
* All persistent data (database, binary files, reports) will be available on your host in the mapped directories.
* For troubleshooting, check logs and ensure your `.env` paths match your Docker volume mounts.