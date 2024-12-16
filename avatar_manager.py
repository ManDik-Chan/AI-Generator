import os
from pathlib import Path
import streamlit as st
import base64

class AvatarManager:
    def __init__(self):
        # 使用streamlit的默认静态文件目录
        self.avatar_dir = Path.cwd() / "assets" / "avatars"
        self.ensure_avatar_directory()

    def ensure_avatar_directory(self):
        """确保头像目录存在并包含默认头像"""
        # 确保目录存在
        os.makedirs(str(self.avatar_dir), exist_ok=True)

    def get_default_avatar_base64(self) -> str:
        """返回一个内置的默认头像base64字符串"""
        # 这是一个简单的默认头像的base64字符串
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAVcSURBVGiB7ZlvbFPXGcZ/517HdpyExE5CCA0JCS0JRfxZKaWiLUEjLQyqIqRJ/Nm6IfEFxBekTZ2mTdOkaltBZepUbZu6pkylrduoYFXWSV2RjFba1QYVRWhp0YYSKCQuIanrxGkSO3YSx/a9Zx8SOzGx7eT6OtGkPp+se97znPc577nnvee8B5ZYYol/ZWSuRMF1t9ZKU70PKFugeSNKHchAGlxnzIHe6Q6w0/b8hzOaX7UWU+lFKT2mtRDLmNgXbmg/pUCE3f+5LIp1I0LtUoqNCvSgA4LLIrGpPuDcfFYWVa4Bsh6kA3AoRSEQ0aSaBkYkTIXD1d7c19OXbz9vAXLHn0BgInLYE8R1tCKfr+UQ3Zb8TURXGpBkUTgnEqTSEbTp2sYPjd79XaIV6xToRSl7kJjVqR5KKaUb6PnkyUdf3H3hwl2GYeQMCcC3vvz11598rH6TUqwDUKBJyBkBi4ZReX/94Z+cEwAREQA7GX9SoWaBYS2VlwBv3tN6b0WB5XCBrkgoClQVo6K+IpN+ADX+FEI0iSiKNRGEEk8kxNQzUrNm9f03lAhxCAVQBQWUFBVgCc798HEtZQQoKS4qyHPcspEQoYFJFAgrIq5E0oQJGglDTYE+kZDj4ZufDPh9g78UyXYAjNwCcEAkZ0Cg6+LUj+qOE3Z03BIBIqJEpDYnA0pRVVpUUFVSKI1KUQjgynfkOz62SCijSN7cw0yEjQr1HGARMAEZnqPxfOWVEiArEIQrSjFtasSUc6ycFcHn87dJkGcU6ACFYEJVyZZTz73qLywotBcXukxNiDsWu6Vr+TW2QofNBiCiVFW/PzDs8fsLAALj0d5UWsUAlFKjQGIiHsI6Z4vbQERUvxWZmABXVWWycd3aHdv2/vbRRMa6Nplc6xsLVEtOxpufevbVL4WiYQOgpuaqeVtVsWnzprXl5RU2gEwmM3H8+Knu0dFIWIGvLxRIK6EXoWayW4KIGCpnAXAYEaQNUG43uXQojFE8+ZvqA+UqoRSVE5nxVYZKbQFoMNITgCEixXb1gLN4pVXEq6aLLy4uXvH97z26NWBrC0Th4vCF1KH9Bw5FhiNBTVNhhHuUUiUBv3/trt89vyOazBgkUfQPDPrPnm0/CyQv9vf1JpITE6lbgB7B6+1KNr1/5ryUwCGFOQEVukFNcaHjruqqZYVOB0ZG0SHTQjRtEkgkGE8k+SjS17HFcf5FgI5ExUshR+kZBYW2SV8gTTQWi4lUF14/1bLHnuT3Cj6vwDB0+6YNdes2bPjCGmUohSAoQERD0wQRDYX6YM+/29986+ChI8/0nL4QBt4D+kWpf23uPHc+c1/2aBXoNX1uFOhFHcBQEulMJpxKp42kzE4rUSrjDoWJ+8P4BsJ4AsM4QxGc4ShGPIlSU6vJOWcAE70vM9rnRQ7MHLSy0B3w4xsKc7L1Q+LxOLFYnGQqRXQsRiwWw+VyqbLSklvtKOLxOJqmMTo6hhEOcLKtne6eTwA0TcNut6PrOul0mlRqenUZhoFpmsTjcVKpFBMTE9jtdgoKppKFiJBKpZBS5L4qZcLAYH9fLJEklUyRSqUxTZN4PE5weBi32z3TP1VljpPYbRaRRDpGIBiioMBJMpXIMfZ4vNP6YrfbCYVCJJNJNE2jrq6OeDyOpmnU19fjdrsJh8Mk4nEAVq26g76+PhKJBHa7nYaGBhobG9F1nZ6eHnRdZ/ny5YyPj2OaJhs3bqS2thZN0+js7GTfvn2Mj4/z4Ycf4vF4CAaD1NbWsmXLFtra2li1ahWaplFVVYXP55u3Gv2/sP8AQm59Sc0qBz4AAAAASUVORK5CYII="

    def get_avatar_path(self, character_type: str = None) -> str:
        """获取角色头像路径或数据"""
        # 角色头像映射
        avatar_mapping = {
            "温柔知性大姐姐": "xiaorou",
            "暴躁顶撞纹身男": "ahu",
            "呆呆萌萌萝莉妹": "tangtang",
            "高冷霸道男总裁": "tingqian",
            "阳光开朗小奶狗": "nuannuan",
            "英姿飒爽女王大人": "ningshuang",
            "默认": "default_assistant"
        }

        # 获取对应的文件名
        file_name = f"{avatar_mapping.get(character_type, 'default_assistant')}.png"
        avatar_path = self.avatar_dir / file_name

        if avatar_path.exists():
            # 如果文件存在，返回文件路径
            return str(avatar_path)
        else:
            # 如果文件不存在，返回默认base64头像
            return self.get_default_avatar_base64()

    def get_user_avatar(self) -> str:
        """获取用户头像"""
        user_avatar_path = self.avatar_dir / "default_user.png"
        if user_avatar_path.exists():
            return str(user_avatar_path)
        return self.get_default_avatar_base64()