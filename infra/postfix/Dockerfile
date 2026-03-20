FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends postfix ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY config/main.cf /etc/postfix/main.cf
COPY config/header_checks /etc/postfix/header_checks
COPY bin/container-entrypoint.sh /usr/local/bin/container-entrypoint.sh
COPY bin/correlate-send-log.sh /usr/local/bin/correlate-send-log.sh

RUN chmod +x /usr/local/bin/container-entrypoint.sh \
  && chmod +x /usr/local/bin/correlate-send-log.sh \
  && mkdir -p /var/log/postfix

EXPOSE 25

ENTRYPOINT ["/usr/local/bin/container-entrypoint.sh"]
