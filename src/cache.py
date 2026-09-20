from collections import OrderedDict


class LRUCache:
    """
    An In-Memory Least Recently Used (LRU) Cache.

    This simulates OS page replacement by evicting the oldest questions
    when the cache is full.
    """

    def __init__(self, capacity: int):
        self.cache = OrderedDict()
        self.capacity = capacity

    def get(self, key: int):
        """Retrieve a question from the cache.

        If the key exists (cache hit), it is moved to the most-recently-used
        position and its value is returned.

        If the key does not exist (cache miss), returns None.
        """
        if key not in self.cache:
            return None

        # Mark as recently used by moving to the end of the OrderedDict.
        self.cache.move_to_end(key)
        return self.cache[key]

    def put(self, key: int, value: dict):
        """Add or update a question in the cache.

        If the key already exists, its value is updated and it is moved to
        the most-recently-used position.

        If the key is new and the cache is at capacity, the least recently
        used item (front of the OrderedDict) is evicted first.
        """
        if key in self.cache:
            # Update existing entry and mark as recently used.
            self.cache.move_to_end(key)
            self.cache[key] = value
        else:
            # Evict the least recently used item if we are at capacity.
            if len(self.cache) >= self.capacity:
                self.cache.popitem(last=False)

            self.cache[key] = value