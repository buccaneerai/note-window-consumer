#!/bin/bash -e
echo "Cloning helm repository..."
git clone https://${CI_GITHUB_TOKEN}@github.com/buccaneerai/helm.git

echo "Changing into helm directory..."
cd helm

echo "Checking out ${BRANCH}..."
git checkout $BRANCH
git pull origin $BRANCH

FILE="services/${SERVICE_NAME}/${STAGE}-values.yaml"

echo "Updating version to ${VERSION} in ${FILE}..."
sed -i'.bak' "s/  version:.*/  version: ${VERSION}/g" $FILE
rm "${STAGE}-values.yaml.bak"

echo "Commiting the change and pushing to ${BRANCH}..."
git config user.email "bot@threadmedical.com"
git config user.name "Thread Medical Bot"
git add $FILE
git commit -m "chore: Bumping ${SERVICE_NAME} to ${VERSION}"
git push origin $BRANCH

echo "Cleaning up..."
cd ..
rm -rf helm || true

echo "Success"
