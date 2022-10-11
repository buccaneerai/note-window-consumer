# note-window-consumer
> 🧠 Consumes new note windows from the GraphQL API and runs predictions on them

## Running it locally

```
> ⚠️ This service makes use of private npm packages, so you'll need to be authenticated to use our company's private npm registry.

### Service dependencies
This service may use other microservices as dependencies.  You'll need to run those locally (using docker) or connect to a running cluster.  The URLs should be provided as environment variables.

In particular, you may want to run an SQS instance locally to send and poll jobs.

### `.env` file
This project receives configuration inputs via the `dotenv` package.
```bash
cp local.env
.env
```
> ⚠️ You'll need to fill in the blanks.  Some of the environment variables include secret keys that are not tracked in .git.

### Run the app
```bash
yarn dev
```

