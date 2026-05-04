from dataclasses import dataclass


@dataclass
class User:
    id: str
    name: str


class UserRepository:
    def __init__(self, users: list[User]):
        self.users = users

    def find_user(self, user_id: str) -> User | None:
        for user in self.users:
            if user.id == user_id:
                return user
        return None


def format_user(user: User) -> str:
    return f"{user.id}:{user.name}"


default_user = User(id="1", name="Ada")
format_user(default_user)
