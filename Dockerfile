# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Google Chrome for Puppeteer
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install app dependencies, but skip downloading Chromium
RUN PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm install

# Copy the rest of the application's source code from your host to your image filesystem.
COPY . .

# Set the PUPPETEER_EXECUTABLE_PATH
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# The user should replace this with their actual build command if they have one.
# For now, we assume no build step is needed.
# RUN npm run build

# Your app binds to 0.0.0.0, so you can connect to it from outside the container
ENV HOST 0.0.0.0

# Make port 3000 available to the world outside this container
EXPOSE 3000

# Define the command to run your app
# This will be overridden by the startCommand in render.yaml
CMD ["npm", "run", "cricket-api"]

# Trigger new deployment on Railway 