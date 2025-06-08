# 🚀 Render Deployment Guide

## Overview
This guide will help you deploy your betting odds monitoring system to Render with both services running:
- **Concurrent Monitor**: Runs the main monitoring system on port 3000
- **Cricket API**: Serves cricket data on port 3005

## 📋 Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: Your code must be in a GitHub repository
3. **MongoDB Database**: Set up MongoDB Atlas or use Render's database service

## 🔧 Deployment Options

### Option 1: Automatic Deployment (Recommended)

Using the `render.yaml` file for automatic service deployment:

1. **Push your code** to GitHub with the `render.yaml` file
2. **Connect to Render**:
   - Go to [render.com/dashboard](https://render.com/dashboard)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Select your repository
   - Render will automatically read `render.yaml` and create both services

### Option 2: Manual Service Creation

#### Step 1: Create Monitoring Service
1. Go to Render Dashboard
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `betting-monitor`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run concurrent-monitor`
   - **Instance Type**: `Starter` (free tier)

#### Step 2: Create Cricket API Service
1. Click "New" → "Web Service" again
2. Connect the same repository
3. Configure:
   - **Name**: `cricket-api`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run cricket-api`
   - **Instance Type**: `Starter` (free tier)

## 🔑 Environment Variables

### For Both Services (automatically handled by render.yaml):
```
NODE_ENV=production
ENABLE_NOTIFICATIONS=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

**Important Notes:**
- **PORT**: Render automatically sets this for each service (you don't need to configure it)
- **MONGODB_URI**: Automatically injected from database using `fromDatabase` in render.yaml
- **No hardcoded ports**: Each service uses `process.env.PORT` for flexibility

## 🗄️ Database Setup

### Using render.yaml (Recommended - Automatic Setup)
The `render.yaml` file automatically creates a MongoDB database and injects the connection string:
- Creates `cricket-data-db` database service
- Automatically sets `MONGODB_URI` for both services using `fromDatabase`
- No manual configuration needed

### Alternative: External MongoDB (MongoDB Atlas)
If you prefer using MongoDB Atlas:
1. Create account at [mongodb.com](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster
3. Get connection string
4. Remove the `fromDatabase` section from `render.yaml`
5. Add `MONGODB_URI` environment variable manually to both services

## 📡 Service URLs

After deployment, your services will be available at:
- **Monitoring System**: `https://betting-monitor.onrender.com`
- **Cricket API**: `https://cricket-api.onrender.com`

## 🎯 Health Checks

Both services include health check endpoints:
- Monitoring: `https://betting-monitor.onrender.com/api/status`
- Cricket API: `https://cricket-api.onrender.com/health`

## 🔄 Deployment Commands

### Local Testing Before Deployment
```bash
# Test monitoring system
npm run concurrent-monitor

# Test cricket API (in separate terminal)
npm run cricket-api

# Test both services
curl http://localhost:3000/api/status
curl http://localhost:3005/health
```

### Production Deployment
```bash
# 1. Commit and push your changes
git add .
git commit -m "Add Render deployment configuration"
git push origin main

# 2. Render will automatically deploy when you push to main branch
```

## 📊 Monitoring Your Deployment

### Check Service Status
1. Go to Render Dashboard
2. Click on each service to view:
   - Build logs
   - Deploy logs
   - Runtime logs
   - Metrics

### Common Issues & Solutions

#### 1. Build Failures
- **Issue**: Dependencies not installing
- **Solution**: Check `package.json` and ensure all dependencies are listed

#### 2. Puppeteer Issues
- **Issue**: Chrome not found
- **Solution**: The Dockerfile includes Chrome installation automatically

#### 3. Database Connection
- **Issue**: MongoDB connection failed
- **Solution**: Verify `MONGODB_URI` environment variable is set correctly

#### 4. Port Conflicts
- **Issue**: Services not starting
- **Solution**: Ensure each service uses different ports (3000 and 3005)

## 🔧 Advanced Configuration

### Custom Domains
1. In Render Dashboard → Service Settings
2. Add custom domain
3. Configure DNS records

### Scaling
- **Free Tier**: Services sleep after 15 minutes of inactivity
- **Paid Tiers**: Always-on services with better performance

### SSL/HTTPS
- Automatic SSL certificates provided by Render
- No additional configuration needed

## 📈 Performance Optimization

### For Production Use:
1. **Upgrade to Paid Plan**: Avoid sleep delays
2. **Database Indexing**: Optimize MongoDB queries
3. **Caching**: Implement Redis for frequently accessed data
4. **Load Balancing**: Use Render's auto-scaling features

## 🛡️ Security Best Practices

1. **Environment Variables**: Never commit sensitive data
2. **Database Security**: Use strong passwords and whitelist IPs
3. **Rate Limiting**: Implement API rate limiting
4. **CORS**: Configure proper CORS policies

## 📋 Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] `render.yaml` configured
- [ ] Environment variables set
- [ ] Database connection string added
- [ ] Services created in Render
- [ ] Health checks passing
- [ ] Both services accessible via URLs
- [ ] Admin interface working
- [ ] API endpoints responding
- [ ] Monitoring system processing URLs

## 🎉 Success Indicators

After successful deployment:
- ✅ Monitoring system accessible at your Render URL
- ✅ Cricket API responding to requests
- ✅ Admin interface loading correctly
- ✅ URL monitoring working
- ✅ Database connections established
- ✅ No errors in service logs

## 🆘 Support

If you encounter issues:
1. Check Render service logs
2. Verify environment variables
3. Test database connections
4. Check GitHub repository permissions
5. Contact Render support if needed

## 🔄 Continuous Deployment

With this setup:
- Every push to `main` branch triggers automatic deployment
- Both services update simultaneously
- Zero-downtime deployments
- Automatic rollback on failure

Your betting odds monitoring system is now production-ready on Render! 🚀 