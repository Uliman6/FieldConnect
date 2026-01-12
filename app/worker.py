from rq import Worker, Queue
from redis import Redis
from .config import settings
from .db import Base, engine

Base.metadata.create_all(bind=engine)

def main():
    redis = Redis.from_url(settings.redis_url)
    q = Queue("lessons", connection=redis)
    w = Worker([q], connection=redis)
    w.work(with_scheduler=False)

if __name__ == "__main__":
    main()
