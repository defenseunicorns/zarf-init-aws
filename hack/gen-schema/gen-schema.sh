#!/usr/bin/env sh

# Create the json schema for the Zarf structs and use it to create the typescript definitions
zarf internal gen-types-schema | npx quicktype -s schema -o ./capabilities/zarf-types.ts
