#!/usr/bin/env sh

if [ -z "$(git status -s capabilities/zarf-types.ts)" ]; then
    echo "Success!"
    exit 0
else
    git diff capabilities/zarf-types.ts
    exit 1
fi
