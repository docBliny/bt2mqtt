# Local development

## Prerequisites
```bash
### Install and configure git (if required)
git config --global user.email MY_USERNAME@users.noreply.github.com

### Install NVM: https://github.com/nvm-sh/nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash

# Install the correct Node version
nvm list-remote --lts
nvm install 18.12.1

### If the default wasn't mapped automatically, run the following
nvm alias default 18.12.1

### Install pnpm
npm install --global pnpm
pnpm setup
```

## Rush and Heft
Install the following globally:
```
pnpm install --global @rushstack/heft @microsoft/rush
```

## Get going
```
rush update
rush build
```

## Deployment
Current workaround for: https://github.com/microsoft/rushstack/issues/3774

rush build
find . -type l | grep python3 | xargs rm
rush deploy --overwrite
