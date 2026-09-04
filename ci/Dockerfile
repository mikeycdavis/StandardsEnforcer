# The CI environment, pinned so that "it passed locally" and "it passed on a runner" mean the same
# thing. Debian rather than Alpine because the hosted runner this mirrors is `ubuntu-latest`, and
# the suite shells out to git constantly: musl/BusyBox differences are exactly the kind of thing
# that would make the two disagree without either being wrong.
#
# Node 20 matches `.github/workflows/ci.yml`. If one moves, both move.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# The suite runs git against a read-only oracle owned by the host user, and against fixture
# repositories it builds under /tmp. Neither is owned by the user git is running as, and git
# refuses those by default with "detected dubious ownership".
#
# This is safe *here* and would not be elsewhere: the container has no network, holds no
# credentials, and is destroyed at the end of the run.
RUN git config --system --add safe.directory '*'

# Fixtures are built and committed by the suite, so git needs an identity. Deliberately not the
# developer's: nothing this container produces is attributable to a person.
RUN git config --system user.name  "StandardsEnforcer local CI" \
 && git config --system user.email "local-ci@invalid"

WORKDIR /work

# The source is COPIED, never bind-mounted. The image therefore *is* the commit under test: once
# the archive has been taken, nothing on the developer's disk can change what runs. That is the
# mechanical half of the exact-commit invariant — the other half is the SHA re-check in
# scripts/submit-pr.*.
#
COPY . /work

# THE INSTALL, AND THE TWO PHASES THIS FILE MUST NOT CONFLATE. Until ADR 0010 there was deliberately
# no install here: this repository had no dependencies, and the absence was an invariant rather than
# an accident. ST-16 needed a real JavaScript parser, so there is now exactly one dependency and an
# install step to match — see ci/dependency-posture.mjs, which asserts the install is pinned and
# reproducible rather than trusting that it is.
#
# `npm ci`, never `npm install`: it installs the committed lockfile exactly, and refuses outright if
# the lockfile and package.json disagree. `npm install` would silently rewrite the lockfile inside
# the image, so the image would stop being the commit under test at the moment it stopped agreeing
# with it.
#
# BUILD TIME HAS A NETWORK. RUN TIME DOES NOT. The comment above about the container having no
# network is about the *running* container (compose.ci.yml sets `network_mode: none`, and
# scripts/submit-pr.* pass `--network none`), and that is still exactly true. This line runs during
# `docker build`, which does reach the registry. The lockfile's integrity hashes are what make that
# fetch reproducible rather than merely repeated: a registry serving different bytes for acorn
# 8.18.0 fails the install instead of silently changing what was tested.
#
# The source arrives from `git archive` of the exact commit, which contains tracked files only, so a
# developer's local node_modules/ cannot leak in through the COPY above. That is why this needs no
# .dockerignore, and why the exact-commit invariant survives adding an install.
RUN npm ci

RUN chmod +x /work/ci/checks.sh

# Run as the image's unprivileged user. Not theatre: several assertions in the suite are about a
# process being unable to reach or alter something, and root would satisfy some of them by
# accident — a false green in the one place this repository exists to prevent one.
RUN mkdir -p /out && chown -R node:node /work /out
USER node

ENTRYPOINT ["/work/ci/checks.sh"]
