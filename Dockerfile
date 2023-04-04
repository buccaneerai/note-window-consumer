FROM node:16

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install packages next to reduce size of layers that need to be rebuilt
# whenever source files are
# COPY ./yarn.lock /usr/src/app/yarn.lock
COPY ./ /usr/src/app
# RUN rm -rf /usr/src/app/yarn.lock
RUN yarn install

# Set a start script to run pre-deployment operations
RUN chmod +x /usr/src/app/start.sh
ENTRYPOINT ["/usr/src/app/start.sh"]

CMD ["yarn", "start"]
