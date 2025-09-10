# Deployment Guide

This project is set up for automated deployment with:
- **Frontend**: GitHub Pages
- **Backend**: GCP Server using Ansible

## Setup Instructions

### 1. GitHub Repository Secrets

Add the following secrets to your GitHub repository (Settings → Secrets and variables → Actions):

- `HOST`: Your GCP server IP address (e.g., `34.123.45.67`)
- `SSH_PRIVATE_KEY`: Your SSH private key for connecting to the GCP server

### 2. Enable GitHub Pages

1. Go to your repository Settings
2. Navigate to Pages section
3. Set Source to "GitHub Actions"
4. The frontend will be automatically deployed when you push to main branch

### 3. GCP Server Setup

Your GCP server should have:
- Ubuntu/Debian OS
- SSH access with the `ashan` user
- Python 3.11+ installed
- Git installed

### 4. Deployment Workflows

#### Frontend Deployment
- **Trigger**: Push to main branch with changes in `frontend/` directory
- **Action**: Builds React app and deploys to GitHub Pages
- **URL**: `https://ashankaushanka96.github.io/set-game/`

#### Backend Deployment
- **Trigger**: Push to main branch with changes in `backend/` or `ansible/` directories
- **Action**: Uses Ansible to deploy backend to GCP server
- **Process**:
  1. Installs system dependencies (Python, Nginx, etc.)
  2. Clones repository
  3. Sets up virtual environment
  4. Installs Python dependencies
  5. Configures systemd service
  6. Sets up Nginx reverse proxy
  7. Starts services

### 5. Configuration

The frontend automatically detects the environment:
- **Development**: Uses localhost for backend connection
- **Production**: Uses the HOST secret variable for backend connection

### 6. Manual Deployment

You can manually trigger deployments:
1. Go to Actions tab in your repository
2. Select the workflow you want to run
3. Click "Run workflow"

### 7. Monitoring

- **Frontend**: Check GitHub Pages deployment status in Actions
- **Backend**: Check GCP server logs with `journalctl -u set-game-backend -f`

### 8. Troubleshooting

#### Frontend Issues
- Check if GitHub Pages is enabled
- Verify the build logs in Actions
- Ensure VITE_API_BASE environment variable is set correctly

#### Backend Issues
- Check SSH key permissions
- Verify HOST variable is correct
- Check Ansible playbook logs
- Verify GCP server connectivity

### 9. File Structure

```
.github/workflows/
├── frontend-deploy.yml    # Frontend deployment to GitHub Pages
└── backend-deploy.yml     # Backend deployment to GCP

ansible/
├── deploy.yml             # Main deployment playbook
├── inventory.yml          # Server inventory
└── templates/
    ├── set-game-backend.service.j2  # Systemd service
    └── nginx.conf.j2                # Nginx configuration
```

