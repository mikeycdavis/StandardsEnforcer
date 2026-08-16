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
# There is deliberately no `npm install`. This repository has no dependencies, and the absence is
# an invariant rather than an accident (see ci/checks.sh, which asserts it rather than trusting it).
COPY . /work

RUN chmod +x /work/ci/checks.sh

# Run as the image's unprivileged user. Not theatre: several assertions in the suite are about a
# process being unable to reach or alter something, and root would satisfy some of them by
# accident — a false green in the one place this repository exists to prevent one.
RUN mkdir -p /out && chown -R node:node /work /out
USER node

ENTRYPOINT ["/work/ci/checks.sh"]
