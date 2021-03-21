FROM hayd/alpine-deno:1.8.1
WORKDIR /app

ADD *.ts ./

RUN deno cache *

CMD ["deno", "run", "--allow-net", "main.ts"]