import os
from pathlib import Path


class AvatarManager:
    def __init__(self):
        self.avatar_dir = Path(__file__).parent / "assets" / "avatars"
        self.avatar_dir.mkdir(parents=True, exist_ok=True)

        # 默认头像路径
        self.default_user_avatar = self.avatar_dir / "default_user.png"
        self.default_assistant_avatar = self.avatar_dir / "default_assistant.png"

    def get_avatar_path(self, character_type: str) -> str:
        """获取角色头像路径"""
        avatar_path = self.avatar_dir / f"{character_type}.png"
        if avatar_path.exists():
            return str(avatar_path)
        return str(self.default_assistant_avatar)

    def get_user_avatar(self) -> str:
        """获取用户头像路径"""
        return str(self.default_user_avatar)