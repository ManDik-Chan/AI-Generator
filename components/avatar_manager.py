import os
from pathlib import Path
import streamlit as st
import base64

class AvatarManager:
    def __init__(self):
        # 使用相对路径
        self.avatar_dir = Path("../assets/avatars")
        self.ensure_avatar_directory()

    def ensure_avatar_directory(self):
        """确保头像目录存在"""
        try:
            os.makedirs(str(self.avatar_dir), exist_ok=True)
        except Exception as e:
            st.error(f"无法创建头像目录: {str(e)}")

    def get_default_avatar_base64(self) -> str:
        """返回默认头像base64字符串"""
        return "data:image/png;base64,..."  # 你的base64字符串

    def get_avatar_path(self, character_type: str = None) -> str:
        """获取角色头像路径或数据"""
        avatar_mapping = {
            "温柔知性大姐姐": "xiaorou",
            "暴躁顶撞纹身男": "ahu",
            "呆呆萌萌萝莉妹": "tangtang",
            "高冷霸道男总裁": "tingqian",
            "阳光开朗小奶狗": "nuannuan",
            "英姿飒爽女王大人": "ningshuang",
            "默认": "default_assistant"
        }

        try:
            file_name = f"{avatar_mapping.get(character_type, 'default_assistant')}.png"
            avatar_path = self.avatar_dir / file_name

            if avatar_path.exists():
                return str(avatar_path)
            else:
                st.warning(f"头像文件不存在: {file_name}")
                return self.get_default_avatar_base64()

        except Exception as e:
            st.error(f"获取头像路径时出错: {str(e)}")
            return self.get_default_avatar_base64()

    def get_user_avatar(self) -> str:
        """获取用户头像"""
        try:
            user_avatar_path = self.avatar_dir / "default_user.png"
            if user_avatar_path.exists():
                return str(user_avatar_path)
            return self.get_default_avatar_base64()
        except Exception as e:
            st.error(f"获取用户头像时出错: {str(e)}")
            return self.get_default_avatar_base64()