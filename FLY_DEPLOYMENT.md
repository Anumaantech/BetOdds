# Deployment to Fly.io

This document provides instructions on how to deploy the backend server to Fly.io.

## 1. Install flyctl

[flyctl](https://fly.io/docs/hands-on/install-flyctl/) is the command-line utility for Fly.io. Follow the instructions for your operating system to install it.

For Windows, you can use PowerShell:
```powershell
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

## 2. Login to Fly.io

After installing `flyctl`, you need to log in to your Fly.io account. If you don't have an account, you can sign up for free.
```
fly auth login
```

## 3. Deploy the application

The application is configured to be deployed using the `Dockerfile` in this repository. The `fly.toml` file contains the configuration for the deployment.

To deploy the application, run the following command from the root of the repository:
```
fly deploy
```

This will build the Docker image, push it to Fly.io's registry, and deploy it.

## Running the API and Monitoring Services

This application has two main services defined in `fly.toml`:
*   **app**: The API Server (`simple-cricket-api.js`)
*   **worker**: The Monitoring Service (`concurrent-monitoring-system.js`)

By default, the `app` process will be started. The `worker` process will not be started automatically because `min_machines_running` is 0.

### Scaling the Processes

You need to scale the `worker` process to have it running.

To see the current scale of your application's processes:
```
fly scale show
```

To scale the `worker` process to run on one machine:
```
fly scale count worker=1
```

And to scale the `app` process (for example, to 2 instances):
```
fly scale count app=2
```

To scale down a process, you can set its count to 0:
```
fly scale count worker=0
```

## Running the API and Monitoring aervices

This application has two main services:
*   **API Server**: `api.js` - A web server that exposes an API on port 3000.
*   **Monitoring Service**: `concurrent-monitoring-system.js` - A script that continuously monitors betting odds.

The `Dockerfile` is configured to start the API server by default (`npm run api`).

### Running the Monitoring Service
To run the monitoring service on Fly.io, you can use `fly ssh console` to connect to your deployed machine and run the script manually:
```
fly ssh console
npm run monitor
```
For a more robust setup, you could define a separate process in your `fly.toml` for the monitoring service, or use a background job runner. 