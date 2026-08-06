ARG BACKUP_BASE_IMAGE=docker.io/library/alpine:3.22
FROM ${BACKUP_BASE_IMAGE}

# GNU tar rather than the busybox applet: the archive is read on other hosts and
# extraction filters must behave predictably.
RUN apk add --no-cache jq tar

COPY entrypoint.sh /opt/backup/entrypoint.sh
COPY stores/ /opt/backup/stores/

RUN chmod 755 /opt/backup/entrypoint.sh /opt/backup/stores/*.sh

ENTRYPOINT ["/opt/backup/entrypoint.sh"]
