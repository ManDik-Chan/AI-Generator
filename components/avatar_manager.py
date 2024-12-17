import os
from pathlib import Path
import streamlit as st
import base64


class AvatarManager:
    def __init__(self):
        self.avatar_dir = Path("assets/avatars").resolve()
        self.ensure_avatar_directory()

        # 定义模型对应的头像
        self.model_avatars = {
            "qwen": "qwen_avatar.png",  # 通义千问的头像
            "chatgpt": "chatgpt_avatar.png",  # ChatGPT的头像
            "claude": "claude_avatar.png",  # Claude的头像
            "glm": "glm_avatar.png"  # GLM的头像
        }

    def ensure_avatar_directory(self):
        """确保头像目录存在"""
        try:
            self.avatar_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            st.error(f"无法创建头像目录: {str(e)}")

    def _get_avatar_base64(self, file_path: Path) -> str:
        """将头像文件转换为base64编码"""
        try:
            if file_path.exists():
                with open(file_path, "rb") as f:
                    return f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"
            return self.get_default_avatar_base64()
        except Exception as e:
            print(f"头像转换错误 ({file_path.name}): {str(e)}")
            return self.get_default_avatar_base64()

    def get_avatar_base64(self, character_type: str = None, model_type: str = None) -> str:
        """
        获取角色头像的base64编码
        :param character_type: 角色类型
        :param model_type: 模型类型（qwen/chatgpt/claude/glm）
        """
        avatar_mapping = {
            "温柔知性大姐姐": "xiaorou.png",
            "暴躁顶撞纹身男": "ahu.png",
            "呆呆萌萌萝莉妹": "tangtang.png",
            "高冷霸道男总裁": "tingqian.png",
            "阳光开朗小奶狗": "nuannuan.png",
            "英姿飒爽女王大人": "ningshuang.png",
            "性感冷艳御姐": "anran.png"
        }

        try:
            if character_type is None:
                return self._get_avatar_base64(self.avatar_dir / "default_user.png")

            # 如果是AI助手且指定了模型，使用对应模型的头像
            if character_type == "AI助手" and model_type:
                model_avatar = self.model_avatars.get(model_type)
                if model_avatar:
                    avatar_path = self.avatar_dir / model_avatar
                    if avatar_path.exists():
                        return self._get_avatar_base64(avatar_path)

            # 其他角色使用固定头像
            file_name = avatar_mapping.get(character_type)
            if file_name:
                return self._get_avatar_base64(self.avatar_dir / file_name)

            # 如果没有找到对应头像，返回默认助手头像
            return self._get_avatar_base64(self.avatar_dir / "default_assistant.png")

        except Exception as e:
            print(f"获取头像错误 ({character_type}): {str(e)}")
            return self.get_default_avatar_base64()

    def get_default_avatar_base64(self) -> str:
        """返回默认头像的 base64 编码"""
        try:
            default_path = self.avatar_dir / "default_assistant.png"
            if default_path.exists():
                with open(default_path, "rb") as f:
                    return f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"
        except Exception:
            pass

        # 返回一个内置的base64默认头像
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAG1BMVEVHcEz///////////////////////////8b/+NWAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAO0lEQVQ4jWNgGAWjgP6AEcJ0/ACTZQQxHYHsDiCTEch0ALKZgUwmIM0IYTqAQADFZIIwmUBMRlrEjgIA7wgRTqrTlx4AAAAASUVORK5CYII="

    def get_user_avatar_base64(self) -> str:
        """获取用户头像的base64编码"""
        try:
            user_avatar_path = self.avatar_dir / "default_user.png"
            if user_avatar_path.exists():
                with open(user_avatar_path, "rb") as f:
                    return f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"
        except Exception as e:
            print(f"获取用户头像错误: {str(e)}")

        # 如果没有找到用户头像，返回默认的用户头像base64编码
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAG1BMVEVHcEz///////////////////////////8b/+NWAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAO0lEQVQ4jWNgGAWjgP6AEcJ0/ACTZQQxHYHsDiCTEch0ALKZgUwmIM0IYTqAQADFZIIwmUBMRlrEjgIA7wgRTqrTlx4AAAAASUVORK5CYII="
