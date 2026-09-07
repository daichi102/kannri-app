# Repository delivery workflow

For every user-requested code or configuration change in this repository:

1. Preserve unrelated files and user changes. Stage only the files required for the request.
2. Run relevant validation (at minimum syntax/build checks appropriate to the changed files).
3. Commit the completed change with a concise commit message.
4. Push the commit to the `main` branch of the `cloudbuild` remote (`https://github.com/daichi102/kannri-app.git`) so the production Cloud Build trigger can deploy it.
5. Confirm the pushed commit hash to the user. If commit, push, or validation fails, do not claim the change is deployed; clearly report what remains.

Never commit or push secrets, local environment files, logs, screenshots, generated caches, or unrelated untracked files. If the user explicitly asks not to commit, push, or deploy a particular change, follow that instruction instead.
