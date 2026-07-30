ARG PZ_BASE_IMAGE=docker.io/indifferentbroccoli/projectzomboid-server-docker:v1.1.8@sha256:950d7b4ff19a04d3f8a1a35af383526ad95c88a9a4d795760b3a9b00ee80b1a0
FROM ${PZ_BASE_IMAGE}

COPY scripts/apply_mods.sh /usr/local/bin/apply-mods

RUN chmod 755 /usr/local/bin/apply-mods

ENTRYPOINT ["/usr/local/bin/apply-mods"]
