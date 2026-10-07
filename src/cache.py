from collections import OrderedDict
import threading

class LRUCache:
    """
    OS Memory Management: Custom Least Recently Used (LRU) Cache.
    This replaces the need for Redis and proves OS Page Replacement concepts.
    """
    def __init__(self, capacity: int = 100):
        self.cache = OrderedDict()
        self.capacity = capacity
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            if key not in self.cache:
                return None  # Cache Miss
            
            self.cache.move_to_end(key)
            return self.cache[key]

    def put(self, key: str, value: dict):
        with self.lock:
            self.cache[key] = value
            self.cache.move_to_end(key)
            
            if len(self.cache) > self.capacity:
                self.cache.popitem(last=False)

ram_cache = LRUCache(capacity=50)