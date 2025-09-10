# Manual Server Setup Guide

Since the `ashan` user doesn't have root access, you'll need to perform some one-time setup tasks manually. Here's the step-by-step guide:

## Prerequisites
- Python 3.11 is already installed ✅
- SSH access to your GCP server as `ashan` user
- Git installed on the server

## Step 1: Create Virtual Environment and Install Dependencies

SSH into your GCP server and run these commands:

```bash
# SSH into your server
ssh ashan@YOUR_GCP_SERVER_IP

# Create the application directory
mkdir -p ~/set-game-backend
cd ~/set-game-backend

# Clone the repository
git clone https://github.com/ashankaushanka96/set-game.git .

# Create virtual environment with Python 3.11
python3.11 -m venv venv

# Activate the virtual environment
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Test that everything works
cd backend
python main.py
```

If the test runs successfully, press `Ctrl+C` to stop it.

## Step 2: Create Management Scripts

Create simple shell scripts to manage the backend:

```bash
# Create run script
cat > ~/set-game-backend/run.sh << 'EOF'
#!/bin/bash
cd ~/set-game-backend/backend
source ~/set-game-backend/venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
EOF

# Create kill script
cat > ~/set-game-backend/kill.sh << 'EOF'
#!/bin/bash
# Kill any running uvicorn processes
pkill -f "uvicorn main:app"
echo "Backend stopped"
EOF

# Create restart script
cat > ~/set-game-backend/restart.sh << 'EOF'
#!/bin/bash
cd ~/set-game-backend

# Kill existing process
./kill.sh

# Wait a moment
sleep 2

# Start the backend
./run.sh
EOF

# Make scripts executable
chmod +x ~/set-game-backend/*.sh

# Test the run script
cd ~/set-game-backend
./run.sh
```

If the test runs successfully, press `Ctrl+C` to stop it.

## Step 3: Configure Firewall (Ask Admin)

Since you don't have root access, ask your system administrator to:

1. **Open port 8000** for the backend:
   ```bash
   sudo ufw allow 8000
   ```

2. **Optional: Set up Nginx reverse proxy** (if you want to use port 80/443):
   ```bash
   sudo apt update
   sudo apt install nginx
   
   # Create nginx config
   sudo tee /etc/nginx/sites-available/set-game-backend << 'EOF'
   server {
       listen 80;
       server_name YOUR_GCP_SERVER_IP;
       
       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       
       location /ws {
           proxy_pass http://127.0.0.1:8000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   EOF
   
   # Enable the site
   sudo ln -s /etc/nginx/sites-available/set-game-backend /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

## Step 4: Test the Setup

1. **Test direct access** (if port 8000 is open):
   ```bash
   curl http://YOUR_GCP_SERVER_IP:8000
   ```

2. **Test through Nginx** (if configured):
   ```bash
   curl http://YOUR_GCP_SERVER_IP
   ```

## Step 5: Update GitHub Secrets

Add these secrets to your GitHub repository:

- `HOST`: Your GCP server IP address
- `SSH_PRIVATE_KEY`: Your SSH private key

## Step 6: Deploy with Ansible

Once the manual setup is complete, the Ansible playbook will handle future deployments:

```bash
# The GitHub workflow will automatically run when you push changes
git add .
git commit -m "Update deployment configuration"
git push origin main
```

## Troubleshooting

### Check if the backend is running:
```bash
ps aux | grep uvicorn
```

### Start the backend:
```bash
cd ~/set-game-backend
./run.sh
```

### Stop the backend:
```bash
cd ~/set-game-backend
./kill.sh
```

### Restart the backend:
```bash
cd ~/set-game-backend
./restart.sh
```

### Manual start (if scripts aren't working):
```bash
cd ~/set-game-backend/backend
source ../venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

## File Structure After Setup

```
/home/ashan/
└── set-game-backend/
    ├── venv/                    # Virtual environment
    ├── backend/                 # Backend code
    │   ├── main.py
    │   ├── requirements.txt
    │   └── ...
    ├── frontend/                # Frontend code
    ├── ansible/                 # Deployment scripts
    ├── run.sh                   # Start backend script
    ├── kill.sh                  # Stop backend script
    └── restart.sh               # Restart backend script
```

## Next Steps

1. Complete the manual setup above
2. Test that the backend is accessible
3. Push your code to trigger the GitHub Actions deployment
4. Your frontend will be deployed to GitHub Pages and will connect to your GCP backend
