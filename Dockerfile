# docker buildx build --push --platform linux/amd64 --tag lucasrod96/zarf-ecr-credential-helper:v0.0.1 .
FROM cgr.dev/chainguard/static:latest

# 65532 is the UID of the `nonroot` user in chainguard/static.  See: https://edu.chainguard.dev/chainguard/chainguard-images/reference/static/overview/#users
USER 65532:65532

COPY --chown=65532:65532 build/zarf-ecr-credential-helper /zarf-ecr-credential-helper

CMD [ "/zarf-ecr-credential-helper" ]
