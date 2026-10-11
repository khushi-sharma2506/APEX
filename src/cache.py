from collections import OrderedDict
import threading
from typing import Optional, Any

class LRUCache:
    """
    OS Memory Management: Custom Least Recently Used (LRU) Cache.
    This replaces the need for Redis and proves OS Page Replacement concepts.
    """
    def __init__(self, capacity: int = 100) -> None:
        self.cache: OrderedDict[str, Any] = OrderedDict()
        self.capacity: int = capacity
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key not in self.cache:
                return None  # Cache Miss
            
            self.cache.move_to_end(key)
            return self.cache[key]

    def put(self, key: str, value: Any) -> None:
        with self.lock:
            self.cache[key] = value
            self.cache.move_to_end(key)
            
            if len(self.cache) > self.capacity:
                self.cache.popitem(last=False)

ram_cache = LRUCache(capacity=50)