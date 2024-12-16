import os
import sys
from pathlib import Path
import base64
current_dir = Path(__file__).parent.resolve()
if str(current_dir) not in sys.path:
    sys.path.append(str(current_dir))
try:
    from utils import generate_script, verify_api_key, generate_xiaohongshu_content, get_chat_response
    from langchain.memory import ConversationBufferMemory
    import streamlit.components.v1 as components
    from character_templates import CHARACTER_TEMPLATES
    from components.avatar_manager import AvatarManager
except ImportError as e:
    import streamlit as st
    st.error(f"导入错误: {str(e)}")
    st.error("请确保所有必要的文件都在正确的位置。")
    st.stop()

# 配置全局路径
ASSETS_DIR = Path("assets")
AVATARS_DIR = ASSETS_DIR / "avatars"

# 确保必要的目录存在
ASSETS_DIR.mkdir(exist_ok=True)
AVATARS_DIR.mkdir(exist_ok=True)

# 初始化头像管理器
avatar_manager = AvatarManager()

# 模型映射配置
model_mapping = {
    "通义千问 (Qwen)": ("qwen", "Qwen-Max"),
    "ChatGPT-4": ("chatgpt", "GPT-4"),
    "Claude 3.5": ("claude", "Claude-3-Sonnet"),
    "GLM-4": ("glm", "GLM-4-Plus")
}

st.set_page_config(
    page_title="内容生成器",
    page_icon="📝",
    layout="wide"
)

def check_avatar_files():
    """检查头像文件是否完整可用"""
    avatars_dir = Path("assets/avatars").resolve()
    if not avatars_dir.exists():
        st.error(f"头像目录不存在: {avatars_dir}")
        return False

    required_files = {
        "xiaorou.png": "温柔知性大姐姐",
        "ahu.png": "暴躁顶撞纹身男",
        "tangtang.png": "呆呆萌萌萝莉妹",
        "tingqian.png": "高冷霸道男总裁",
        "nuannuan.png": "阳光开朗小奶狗",
        "ningshuang.png": "英姿飒爽女王大人",
        "default_user.png": "默认用户"
    }

    missing_files = []
    for file_name, character_name in required_files.items():
        file_path = avatars_dir / file_name
        if not file_path.exists():
            missing_files.append(f"{file_name} ({character_name})")

    if missing_files:
        st.warning(f"以下头像文件缺失:\n" + "\n".join(missing_files))
        return False

    return True


def debug_avatar_paths():
    """调试头像文件路径"""
    avatars_dir = Path("assets/avatars").resolve()

    st.write("当前工作目录:", os.getcwd())
    st.write("头像目录:", str(avatars_dir))
    st.write("头像目录是否存在:", avatars_dir.exists())

    if avatars_dir.exists():
        st.write("可用的头像文件:")
        for file in avatars_dir.glob("*.png"):
            st.write(f"- {file.name}")
            # 尝试读取文件
            try:
                with open(file, "rb") as f:
                    content = f.read(100)  # 只读取前100字节
                    st.write(f"  - 文件可读: 是 (大小: {len(content)} bytes)")
            except Exception as e:
                st.write(f"  - 文件可读: 否 ({str(e)})")

    # 测试具体的角色头像
    test_file = avatars_dir / "xiaorou.png"
    st.write("\n测试小柔头像:")
    st.write("- 路径:", str(test_file))
    st.write("- 存在:", test_file.exists())
    if test_file.exists():
        st.write("- 是文件:", test_file.is_file())
        st.write("- 大小:", test_file.stat().st_size, "bytes")
        st.write("- 权限:", oct(test_file.stat().st_mode)[-3:])


# 在页面初始化时调用
if 'debug_mode' in st.session_state and st.session_state.debug_mode:
    debug_avatar_paths()

# 在应用启动时调用这个函数
if not check_avatar_files():
    st.warning("部分头像文件缺失，将使用默认头像替代")
check_avatar_files()

def create_copy_button(text: str, button_text: str = "📋 复制到剪贴板", key: str = None) -> None:
    """使用 Streamlit 原生组件创建复制按钮"""
    if key not in st.session_state:
        st.session_state[key] = False

    if st.button(button_text, key=f"btn_{key}", use_container_width=True):
        try:
            import pyperclip
            pyperclip.copy(text)
            st.session_state[key] = True
            st.success('✅ 已复制到剪贴板！', icon="✅")
        except ImportError:
            st.error('请先安装 pyperclip: pip install pyperclip')


def get_avatar_path(character_type: str = None) -> str:
    """获取头像图片路径"""
    try:
        # 确保AVATARS_DIR是绝对路径
        avatars_dir = Path("assets/avatars").resolve()

        if character_type is None:
            default_path = avatars_dir / "default_user.png"
            if default_path.exists():
                return str(default_path)
            return avatar_manager.get_default_avatar_base64()

        # 角色头像映射
        avatar_mapping = {
            "温柔知性大姐姐": "xiaorou.png",
            "暴躁顶撞纹身男": "ahu.png",
            "呆呆萌萌萝莉妹": "tangtang.png",
            "高冷霸道男总裁": "tingqian.png",
            "阳光开朗小奶狗": "nuannuan.png",
            "英姿飒爽女王大人": "ningshuang.png",
            "默认": "default_user.png"
        }

        # 获取对应角色的头像文件名
        avatar_file = avatar_mapping.get(character_type, "default_user.png")
        avatar_path = avatars_dir / avatar_file

        if avatar_path.exists():
            return str(avatar_path)

        # 如果文件不存在，记录更多信息
        st.warning(f"""
        头像读取失败:
        - 当前角色: {character_type}
        - 查找文件: {avatar_file}
        - 完整路径: {avatar_path}
        """)

        # 返回默认头像
        return avatar_manager.get_default_avatar_base64()

    except Exception as e:
        st.error(f"获取头像路径出错: {str(e)}")
        return avatar_manager.get_default_avatar_base64()


def get_image_base64(image_path: str) -> str:
    """将图片转换为base64编码"""
    if not image_path or not os.path.exists(image_path):
        return ""

    try:
        with open(image_path, "rb") as image_file:
            return base64.b64encode(image_file.read()).decode()
    except Exception as e:
        st.error(f"图片处理错误: {str(e)}")
        return ""


# 初始化 session state
if 'api_keys' not in st.session_state:
    st.session_state.api_keys = {
        'qwen': st.secrets.get("api_keys", {}).get("dashscope", ""),
        'chatgpt': "",
        'claude': "",
        'glm': st.secrets.get("api_keys", {}).get("glm", "")
    }

if 'use_env_qwen_key' not in st.session_state:
    st.session_state.use_env_qwen_key = False
if 'use_env_glm_key' not in st.session_state:
    st.session_state.use_env_glm_key = False
if 'character_messages' not in st.session_state:
    st.session_state.character_messages = {}
if 'character_memories' not in st.session_state:
    st.session_state.character_memories = {}
if 'travel_response' not in st.session_state:
    st.session_state.travel_response = None
if 'selected_character' not in st.session_state:
    st.session_state.selected_character = "默认"
# 侧边栏配置
with st.sidebar:
    st.subheader("🤖 模型选择")

    # 更新模型信息
    model_info = {
        "通义千问 (Qwen)": {
            "key": "qwen",
            "model_name": "Qwen-Max",
            "description": "阿里云最新版通义千问大模型",
            "api_label": "通义千问API密钥:",
            "api_url": "https://bailian.console.aliyun.com/?apiKey=1#/api-key"
        },
        "ChatGPT-4": {
            "key": "chatgpt",
            "model_name": "GPT-4",
            "description": "OpenAI最新版GPT-4大模型",
            "api_label": "OpenAI API密钥:",
            "api_url": "https://platform.openai.com/api-keys"
        },
        "Claude 3.5": {
            "key": "claude",
            "model_name": "Claude-3-Sonnet-20240229",
            "description": "Anthropic最新版Claude 3大模型",
            "api_label": "Anthropic API密钥:",
            "api_url": "https://console.anthropic.com/settings/keys"
        },
        "GLM-4": {
            "key": "glm",
            "model_name": "GLM-4-Plus",
            "description": "智谱最新版ChatGLM大模型",
            "api_label": "智谱API密钥:",
            "api_url": "https://open.bigmodel.cn/usercenter/apikeys"
        }
    }

    model_type = st.selectbox(
        "选择AI模型",
        list(model_info.keys()),
        key="model_select"
    )

    # 显示模型详细信息
    st.caption(f"**当前模型**: {model_info[model_type]['model_name']}")
    st.caption(f"**模型说明**: {model_info[model_type]['description']}")
    st.markdown(f"🔗 [获取API密钥]({model_info[model_type]['api_url']})")

    st.markdown("---")
    st.subheader("🔑 API密钥配置")

    model_key = model_info[model_type]['key']
    key_label = model_info[model_type]['api_label']
    key_url = model_info[model_type]['api_url']

    # 只为qwen和glm显示预存密钥选项
    if model_key in ["qwen", "glm"]:
        # 添加选择框让用户选择是否使用预存密钥
        use_stored_key = st.checkbox(
            "使用预存密钥",
            key=f"use_stored_{model_key}",
            value=st.session_state.get(f'use_env_{model_key}_key', False)
        )

        if use_stored_key:
            # 如果选择使用预存密钥，从session state获取密钥
            st.session_state[f'use_env_{model_key}_key'] = True
            api_key = st.session_state.api_keys[model_key]
            st.text_input(
                key_label,
                value="*" * 10,  # 显示星号而不是实际密钥
                disabled=True,
                type="password"
            )
            st.info("✅ 已加载预存密钥")
        else:
            # 如果不使用预存密钥，显示输入框
            st.session_state[f'use_env_{model_key}_key'] = False
            api_key = st.text_input(
                key_label,
                type="password",
                value="",  # 不显示任何预设值
                key=f"{model_key}_key"
            )
            if api_key:  # 如果用户输入了新的密钥
                st.session_state.api_keys[model_key] = api_key
    else:
        # 对于其他模型，正常显示输入框
        api_key = st.text_input(
            key_label,
            type="password",
            value=st.session_state.api_keys.get(model_key, ''),
            key=f"{model_key}_key"
        )
        if api_key:  # 如果用户输入了新的密钥
            st.session_state.api_keys[model_key] = api_key

    # 验证和保存按钮部分
    col1, col2 = st.columns(2)

    with col1:
        if st.button("🔍 验证密钥",
                     key="verify_btn",
                     disabled=not api_key):
            if not api_key:
                st.error("⚠️ 请输入密钥！")
            else:
                with st.spinner("正在验证密钥..."):
                    try:
                        is_valid, message = verify_api_key(model_key, api_key)
                        if is_valid:
                            st.success(f"✅ {message}")
                            st.session_state[f"{model_key}_verified"] = True
                        else:
                            st.error(f"❌ {message}")
                            st.session_state[f"{model_key}_verified"] = False
                    except Exception as e:
                        st.error(f"❌ 验证过程出错: {str(e)}")
                        st.session_state[f"{model_key}_verified"] = False

    with col2:
        if st.button("💾 保存密钥",
                     key="save_btn",
                     disabled=not api_key):
            if not api_key:
                st.error("⚠️ 请输入密钥！")
            elif not st.session_state.get(f"{model_key}_verified", False):
                st.error("⚠️ 请先验证密钥！")
            else:
                st.session_state.api_keys[model_key] = api_key
                st.success("✅ 密钥已保存！")

# 主界面内容生成部分
tabs = st.tabs(["📹 视频脚本", "📱 小红书文案", "🗨️ AI聊天", "🌍 旅游助手", "⚖️ 政法助手"])

# 视频脚本生成标签页
with tabs[0]:
    st.header("💡 脚本生成")

    col1, col2, col3 = st.columns(3)

    with col1:
        subject = st.text_input("📝 视频主题", key="subject_input",
                                placeholder="例如：如何提高工作效率")

    with col2:
        video_length = st.number_input("⌛ 视频时长(分钟)",
                                       min_value=0.1,
                                       max_value=30.0,
                                       value=3.0,
                                       step=0.1,
                                       key="length_input")

    with col3:
        temperature = st.slider(
            "🎨 文本的多样性",
            min_value=0.0,
            max_value=1.0,
            value=0.2,
            step=0.1,
            help="调节生成文本的多样性：数值越低，生成的内容越稳定；数值越高，生成的内容越多样有创意",
            key="temperature_slider"
        )

    if temperature < 0.3:
        st.caption("当前设置：生成稳定、重复性强的内容")
    elif temperature < 0.7:
        st.caption("当前设置：生成平衡的内容")
    else:
        st.caption("当前设置：生成富有创意、多样化的内容")

    current_model_key = model_mapping[model_type][0]
    is_key_verified = st.session_state.get(f"{current_model_key}_verified", False)

    generate_script_btn = st.button(
        "🎬 生成脚本",
        key="generate_script_btn",
        use_container_width=True,
        disabled=not is_key_verified
    )

    if not is_key_verified:
        st.warning("⚠️ 请先在侧边栏验证API密钥")

    if generate_script_btn:
        if not subject:
            st.error("⚠️ 请输入视频的主题")
            st.stop()
        if not video_length >= 0.1:
            st.error("⚠️ 请选择视频的时长")
            st.stop()

        with st.spinner(f"🎯 正在使用 {model_type} 生成脚本，请稍后..."):
            try:
                title, script = generate_script(
                    subject=subject,
                    video_length=video_length,
                    creativity=temperature,
                    model_type=current_model_key,
                    api_key=st.session_state.api_keys[current_model_key],
                    temperature=temperature
                )

                st.success("✅ 视频脚本已生成！")
                st.session_state['generated_title'] = title
                st.session_state['generated_script'] = script

            except Exception as e:
                st.error(f"❌ 生成失败：{str(e)}")
                st.info("💡 请检查API密钥是否正确，或稍后重试")

    if 'generated_title' in st.session_state and 'generated_script' in st.session_state:
        st.markdown("---")
        st.header("🎯 生成结果")
        st.subheader("📌 视频标题")
        st.info(st.session_state['generated_title'])

        st.subheader("📝 视频脚本")
        st.write(st.session_state['generated_script'])

        # 复制功能（不包含声明文本）
        full_script = f"标题：{st.session_state['generated_title']}\n\n{st.session_state['generated_script']}"
        create_copy_button(full_script, "📋 复制脚本到剪贴板", "copy_script_btn")

        # 添加AI声明
        st.markdown(f"---\n*此内容为 {model_type} 所生成，仅供参考，请自行着重考量。*", help="AI生成内容可能需要人工审核和修改")

# 小红书文案生成标签页
with tabs[1]:
    st.header("💡 小红书文案生成")

    theme = st.text_input("📝 文案主题", key="xiaohongshu_theme",
                          placeholder="例如：探店/美食/旅游/穿搭分享")

    col1, col2 = st.columns(2)

    with col1:
        temperature = st.slider(
            "🎨 文案创意度",
            min_value=0.0,
            max_value=1.0,
            value=0.7,
            step=0.1,
            help="调节生成文案的创意度：数值越低，生成的内容越严谨；数值越高，生成的内容越有创意",
            key="xiaohongshu_temperature_slider"
        )

    is_key_verified = st.session_state.get(f"{current_model_key}_verified", False)

    generate_xiaohongshu_btn = st.button(
        "✨ 生成文案",
        key="generate_xiaohongshu_btn",
        use_container_width=True,
        disabled=not is_key_verified
    )

    if not is_key_verified:
        st.warning("⚠️ 请先在侧边栏验证API密钥")

    if generate_xiaohongshu_btn:
        if not theme:
            st.error("⚠️ 请输入文案主题")
            st.stop()

        with st.spinner(f"🎯 正在使用 {model_type} 生成小红书文案，请稍后..."):
            try:
                result = generate_xiaohongshu_content(
                    theme=theme,
                    model_type=current_model_key,
                    api_key=st.session_state.api_keys[current_model_key],
                    temperature=temperature
                )

                st.success("✅ 小红书文案已生成！")
                st.session_state['xiaohongshu_result'] = result

            except Exception as e:
                st.error(f"❌ 生成失败：{str(e)}")
                st.info("💡 请检查API密钥是否正确，或稍后重试")

    if 'xiaohongshu_result' in st.session_state:
        st.markdown("---")
        st.header("🎯 生成结果")

        result = st.session_state['xiaohongshu_result']

        if 'title' in result:
            st.subheader("📌 文案标题")
            st.info(result['title'])
            selected_title = result['title']
        elif 'titles' in result:
            st.subheader("📌 标题选项")
            for idx, title in enumerate(result['titles'], 1):
                st.info(f"标题 {idx}: {title}")
            selected_title = result['titles'][0]

        st.subheader("📝 文案内容")
        st.write(result['content'])

        st.subheader("#️⃣ 推荐标签")
        tags = result['tags']
        st.write(' '.join([f"#{tag}" for tag in tags]))

        # 复制功能（不包含声明文本）
        full_content = f"{selected_title}\n\n{result['content']}\n\n{' '.join([f'#{tag}' for tag in tags])}"
        create_copy_button(full_content, "📋 复制文案到剪贴板", "copy_xiaohongshu_btn")

        # 添加AI声明
        st.markdown(f"---\n*此内容为 {model_type} 所生成，仅供参考，请自行着重考量。*", help="AI生成内容可能需要人工审核和修改")


def get_avatar_path(character_type: str = None) -> str:
    """获取头像图片路径"""
    # 修改为你的实际头像路径
    base_path = Path(r"C:\Users\21157\PycharmProjects\视频文案生成\venv\assets\avatars")

    if character_type is None:
        # 用户头像
        return str(base_path / "default_user.png")

    # 角色头像映射
    avatar_mapping = {
        "温柔知性大姐姐": "xiaorou.png",
        "暴躁顶撞纹身男": "ahu.png",
        "呆呆萌萌萝莉妹": "tangtang.png",
        "高冷霸道男总裁": "tingqian.png",
        "阳光开朗小奶狗": "nuannuan.png",
        "英姿飒爽女王大人": "ningshuang.png",
        "默认": "default_user.png"
    }

    # 获取对应角色的头像文件名
    avatar_file = avatar_mapping.get(character_type, "default_user.png")
    return str(base_path / avatar_file)


# 聊天标签页
with tabs[2]:
    st.header("💭 AI聊天助手")

    # 创建两列布局
    col1, col2 = st.columns([2, 1])

    with col2:
        # 人设选择部分
        previous_character = st.session_state.get('selected_character', "默认")
        st.session_state.selected_character = st.selectbox(
            "🎭 选择AI人设",
            ["默认"] + list(CHARACTER_TEMPLATES.keys()),
            key="character_select"
        )

        # 检测人设是否改变
        if previous_character != st.session_state.selected_character:
            if st.session_state.selected_character not in st.session_state.character_messages:
                # 初始化新人设的消息和记忆
                character = CHARACTER_TEMPLATES[st.session_state.selected_character]
                welcome_msg = f"你好，我是{character['name']}，有什么可以帮你的吗？"
                st.session_state.character_messages[st.session_state.selected_character] = [
                    {"role": "assistant", "content": welcome_msg}
                ]
                # 创建新的记忆实例
                st.session_state.character_memories[st.session_state.selected_character] = ConversationBufferMemory(
                    return_messages=True,
                    memory_key="chat_history",
                    input_key="input",
                    output_key="output"
                )

        if st.session_state.selected_character != "默认":
            character = CHARACTER_TEMPLATES[st.session_state.selected_character]
            st.markdown(f"**当前人设**: {character['name']}")
            with st.expander("👀 查看人设详情"):
                st.markdown(character['personality'])
                st.markdown("**示例回复:**")
                for example in character['example_responses']:
                    st.markdown(f"- {example}")


    def get_image_base64(image_path: str) -> str:
        """将图片转换为base64编码"""
        if not image_path:
            return ""

        try:
            if os.path.exists(image_path):
                with open(image_path, "rb") as image_file:
                    import base64
                    return base64.b64encode(image_file.read()).decode()
        except Exception as e:
            print(f"Error converting image to base64: {str(e)}")
        return ""

    with col1:
        def render_chat_interface():
            chat_container = st.container()

            with chat_container:
                if st.session_state.selected_character not in st.session_state.character_messages:
                    st.session_state.character_messages[st.session_state.selected_character] = []

                messages = st.session_state.character_messages[st.session_state.selected_character]

                for idx, message in enumerate(messages):
                    is_user = message["role"] == "user"

                    # 直接使用角色名获取对应的base64头像
                    if is_user:
                        avatar_html = f'<img src="{avatar_manager.get_default_avatar_base64()}" style="width: 40px; height: 40px; border-radius: 20px;'
                    else:
                        try:
                            # 尝试直接读取头像文件并转换为base64
                            avatar_file = f"{AVATARS_DIR}/{'xiaorou.png' if st.session_state.selected_character == '温柔知性大姐姐' else 'default_user.png'}"
                            with open(avatar_file, "rb") as f:
                                b64_string = base64.b64encode(f.read()).decode()
                                avatar_html = f'<img src="data:image/png;base64,{b64_string}" style="width: 40px; height: 40px; border-radius: 20px;'
                        except Exception as e:
                            # 如果读取失败，使用默认base64头像
                            avatar_html = f'<img src="{avatar_manager.get_default_avatar_base64()}" style="width: 40px; height: 40px; border-radius: 20px;'

                    if is_user:
                        avatar_html += ' margin-left: 10px;">'
                    else:
                        avatar_html += ' margin-right: 10px;">'

                    # 设置消息样式
                    if is_user:
                        st.markdown(
                            f"""
                            <div style="display: flex; justify-content: flex-end; align-items: flex-start; margin: 10px 0;">
                                <div style="max-width: 80%; text-align: right;">
                                    <div style="font-size: 12px; color: white; margin-bottom: 5px;">你</div>
                                    <div style="background-color: #2b313e; color: white; border-radius: 20px; padding: 15px;">
                                        {message["content"]}
                                    </div>
                                </div>
                                {avatar_html}
                            </div>
                            """,
                            unsafe_allow_html=True
                        )
                    else:
                        character_styles = {
                            "温柔知性大姐姐": ("#f8e1e7", "#d35d90"),
                            "暴躁顶撞纹身男": ("#ffe4e1", "#ff4500"),
                            "呆呆萌萌萝莉妹": ("#ffebcd", "#ff69b4"),
                            "高冷霸道男总裁": ("#e6e6fa", "#483d8b"),
                            "阳光开朗小奶狗": ("#fff8dc", "#ffa500"),
                            "英姿飒爽女王大人": ("#e6e6fa", "#800080")
                        }
                        style = character_styles.get(st.session_state.selected_character, ("#f0f2f6", "#1a1a1a"))

                        character_name = CHARACTER_TEMPLATES[st.session_state.selected_character][
                            "name"] if st.session_state.selected_character != "默认" else "AI助手"

                        st.markdown(
                            f"""
                            <div style="display: flex; justify-content: flex-start; align-items: flex-start; margin: 10px 0;">
                                {avatar_html}
                                <div style="max-width: 80%;">
                                    <div style="font-size: 12px; color: {style[1]}; margin-bottom: 5px;">
                                        {character_name}
                                    </div>
                                    <div style="background-color: {style[0]}; color: {style[1]}; border-radius: 20px; padding: 15px;">
                                        {message["content"]}
                                    </div>
                                </div>
                            </div>
                            """,
                            unsafe_allow_html=True
                        )



        def handle_input():
            """处理用户输入的函数"""
            if st.session_state.user_input and st.session_state.user_input.strip():
                user_input = st.session_state.user_input
                current_character = st.session_state.selected_character

                # 添加用户消息到历史记录
                if current_character not in st.session_state.character_messages:
                    st.session_state.character_messages[current_character] = []

                st.session_state.character_messages[current_character].append({
                    "role": "user",
                    "content": user_input
                })

                try:
                    # 获取当前模型信息
                    current_model_key = model_mapping[model_type][0]
                    api_key = st.session_state.api_keys[current_model_key]

                    # 确保记忆存在
                    if current_character not in st.session_state.character_memories:
                        st.session_state.character_memories[current_character] = ConversationBufferMemory(
                            return_messages=True,
                            memory_key="chat_history",
                            input_key="input",
                            output_key="output"
                        )

                    # 获取AI响应
                    response = get_chat_response(
                        prompt=user_input,
                        memory=st.session_state.character_memories[current_character],
                        model_type=current_model_key,
                        api_key=api_key,
                        character_type=current_character if current_character != "默认" else None,
                        is_chat_feature=True
                    )
                    # 添加AI响应到历史记录
                    st.session_state.character_messages[current_character].append({
                        "role": "assistant",
                        "content": response
                    })

                except Exception as e:
                    st.error(f"获取响应失败: {str(e)}")

                # 清空输入框
                st.session_state.user_input = ""


        # 显示对话界面
        if st.session_state.selected_character in st.session_state.character_messages:
            render_chat_interface()

        # 输入框和按钮布局
        col_input, col_button = st.columns([6, 1])

        with col_input:
            if not is_key_verified:
                st.warning("⚠️ 请先在侧边栏验证API密钥")
            elif st.session_state.selected_character == "默认":
                st.warning("⚠️ 请先选择一个AI人设")
            else:
                st.text_input(
                    "输入消息...",
                    key="user_input",
                    on_change=handle_input,
                    label_visibility="collapsed"
                )

        with col_button:
            if st.button("🗑️", help="清空当前对话"):
                if st.session_state.selected_character in st.session_state.character_messages:
                    # 获取欢迎消息
                    character = CHARACTER_TEMPLATES[st.session_state.selected_character]
                    welcome_msg = f"你好，我是{character['name']}，有什么可以帮你的吗？"

                    # 重置消息历史
                    st.session_state.character_messages[st.session_state.selected_character] = [
                        {"role": "assistant", "content": welcome_msg}
                    ]

                    # 重置记忆
                    st.session_state.character_memories[st.session_state.selected_character] = ConversationBufferMemory(
                        return_messages=True,
                        memory_key="chat_history",
                        input_key="input",
                        output_key="output"
                    )
                    st.rerun()

with tabs[3]:
    st.header("🌍 智能旅游助手")

    # 创建两列布局
    col1, col2 = st.columns([2, 1])

    with col1:
        # 基本信息输入
        st.subheader("📝 旅行基本信息")

        # 目的地选择
        destination = st.text_input("🎯 目的地",
                                    placeholder="例如：北京、上海、成都等",
                                    help="请输入你想去的城市或景点")

        # 日期选择
        col_date1, col_date2 = st.columns(2)
        with col_date1:
            start_date = st.date_input("出发日期")
        with col_date2:
            end_date = st.date_input("返回日期")

        # 预算范围
        budget = st.slider("💰 预算范围（元）",
                           min_value=1000,
                           max_value=50000,
                           value=5000,
                           step=1000)

        # 出行人数
        travelers = st.number_input("👥 出行人数",
                                    min_value=1,
                                    max_value=10,
                                    value=2)

        # 出行偏好
        preferences = st.multiselect(
            "✨ 出行偏好（多选）",
            ["文化历史", "自然风光", "美食探索", "购物娱乐", "休闲度假", "户外运动"],
            default=["文化历史", "美食探索"]
        )

    with col2:
        # 添加功能选择区
        st.subheader("🎯 功能选择")

        function_options = {
            "行程规划": "根据你的偏好生成详细的日程安排",
            "交通建议": "提供最优的交通路线和方式",
            "住宿推荐": "推荐符合预算的酒店和住宿",
            "美食指南": "推荐当地特色美食和餐厅",
            "景点介绍": "介绍主要景点和票价信息",
            "天气查询": "查看目的地的天气预报",
            "花费预估": "估算整体旅行费用"
        }

        selected_function = st.radio(
            "选择需要的功能",
            list(function_options.keys()),
            format_func=lambda x: f"{x} - {function_options[x]}"
        )

    # 生成按钮
    current_model_key = model_mapping[model_type][0]
    is_key_verified = st.session_state.get(f"{current_model_key}_verified", False)

    if not is_key_verified:
        st.warning("⚠️ 请先在侧边栏验证API密钥")

    col_gen, col_clear = st.columns([4, 1])

    with col_gen:
        generate_btn = st.button("🎯 生成建议", use_container_width=True, disabled=not is_key_verified)

    with col_clear:
        if st.button("🗑️ 清除", use_container_width=True):
            st.session_state.travel_response = None
            st.rerun()

    if generate_btn:
        if not destination:
            st.error("⚠️ 请输入目的地")
            st.stop()

        with st.spinner(f"🎯 正在为您规划{destination}之旅..."):
            try:
                # 构建提示词
                days = (end_date - start_date).days + 1

                if selected_function == "行程规划":
                    prompt = f"""请帮我规划一个{destination}的{days}天行程。
具体信息如下：
- 出行日期：{start_date} 到 {end_date}
- 预算：{budget}元
- 出行人数：{travelers}人
- 偏好：{', '.join(preferences)}

请提供详细的行程安排，包括：
1. 每天的行程安排（景点、用餐、休息等）
2. 建议游玩时长
3. 交通方式建议
4. 用餐和休息时间安排
5. 注意事项和建议

请确保行程合理，充分考虑游玩时间和交通时间。"""

                elif selected_function == "交通建议":
                    prompt = f"""请为我推荐去{destination}的最佳交通方式。
具体信息如下：
- 出行日期：{start_date}
- 出行人数：{travelers}人
- 预算：{budget}元

请提供以下信息：
1. 不同交通方式的对比（飞机、高铁、大巴等）
2. 各种交通方式的大概价格
3. 最优交通方案建议
4. 当地交通卡办理建议
5. 从机场/车站到市区的交通建议"""

                elif selected_function == "住宿推荐":
                    prompt = f"""请为我在{destination}推荐合适的住宿。
具体信息如下：
- 入住日期：{start_date} 到 {end_date}
- 人数：{travelers}人
- 预算：每晚{budget // days}元左右

请提供以下信息：
1. 推荐的住宿区域
2. 不同价位的住宿选择
3. 各类型住宿的优缺点
4. 订房注意事项
5. 具体住宿推荐（含预估价格）"""

                elif selected_function == "美食指南":
                    prompt = f"""请为我推荐{destination}的特色美食。
具体信息如下：
- 预算：人均{budget // days // travelers}元/天
- 人数：{travelers}人

请提供以下信息：
1. 必尝特色美食清单
2. 推荐餐厅和小吃街
3. 各美食预估价格
4. 用餐建议和注意事项
5. 美食打卡地图规划"""

                elif selected_function == "景点介绍":
                    prompt = f"""请为我介绍{destination}的主要景点。

请提供以下信息：
1. 必游景点清单及门票价格
2. 各景点游玩建议时长
3. 最佳游玩时间
4. 门票预订建议
5. 景点之间的交通安排"""

                elif selected_function == "天气查询":
                    prompt = f"""请为我介绍{destination}的天气情况。
计划出行日期：{start_date} 到 {end_date}

请提供以下信息：
1. 当地天气特点
2. 建议携带的衣物
3. 天气对行程的影响
4. 出行建议
5. 必备物品清单"""

                else:  # 花费预估
                    prompt = f"""请帮我预估在{destination}旅行的整体费用。
具体信息如下：
- 出行日期：{start_date} 到 {end_date}
- 人数：{travelers}人
- 总预算：{budget}元
- 偏好：{', '.join(preferences)}

请提供以下信息：
1. 交通费用预估
2. 住宿费用预估
3. 餐饮费用预估
4. 门票费用预估
5. 其他费用预估（购物、娱乐等）
6. 建议预留的额外费用
7. 省钱建议和攻略"""

                # 获取回复
                response = get_chat_response(
                    prompt=prompt,
                    memory=None,
                    model_type=current_model_key,
                    api_key=st.session_state.api_keys[current_model_key],
                    character_type=None,
                    is_chat_feature=False
                )

                # 保存响应到 session state
                st.session_state.travel_response = response

            except Exception as e:
                st.error(f"生成失败：{str(e)}")
                st.info("💡 请检查输入内容是否完整，或稍后重试")

    if st.session_state.travel_response:
        st.markdown("---")
        st.markdown("### 🎯 规划结果")
        st.write(st.session_state.travel_response)

        # 复制按钮（不包含声明文本）
        create_copy_button(
            text=st.session_state.travel_response,
            button_text="📋 复制到剪贴板",
            key="travel_copy"
        )

        # 添加AI声明
        st.markdown(f"---\n*此内容为 {model_type} 所生成，仅供参考，请自行着重考量。*", help="AI生成内容可能需要人工审核和修改")

    # 添加提示信息
    with st.expander("💡 使用提示"):
        st.markdown("""
        1. **行程规划**: 输入目的地、日期和预算，获取详细的行程安排
        2. **交通建议**: 获取去往目的地的最佳交通方式和本地交通建议
        3. **住宿推荐**: 根据预算和偏好获取住宿推荐
        4. **美食指南**: 发现当地特色美食和推荐餐厅
        5. **景点介绍**: 了解主要景点信息和门票价格
        6. **天气查询**: 查看目的地天气情况和着装建议
        7. **花费预估**: 获取旅行整体费用预估和省钱建议
        """)

with tabs[4]:
    from legal_assistant import render_legal_assistant
    render_legal_assistant()