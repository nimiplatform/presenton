"""The Python business service is a child of the protected Presenton Host."""
import os
import sys
from services.nimi_channel import start_channel, ready

if __name__ == '__main__':
    if not os.environ.get('PRESENTON_HOST_KEY') or not os.environ.get('APP_DATA_DIRECTORY'):
        raise SystemExit('Start Presenton through pnpm dev and Nimi')
    def parent_disconnected():
        import signal
        try:
            if os.name != "nt":
                os.killpg(os.getpid(), signal.SIGTERM)
        finally:
            os._exit(0)
    start_channel(parent_disconnected)
    import uvicorn

    class SupervisedServer(uvicorn.Server):
        async def startup(self, sockets=None):
            await super().startup(sockets)
            if not self.should_exit:
                ready(self.config.port)

    server = SupervisedServer(uvicorn.Config('api.main:app', host='127.0.0.1',
        port=int(sys.argv[1]), log_level='info'))
    server.run()
    # The supervised stdin reader can still be blocked. Uvicorn has finished
    # lifespan cleanup; do not finalize Python's buffered stdin under that thread.
    sys.stderr.flush()
    os._exit(0 if server.started else 1)
