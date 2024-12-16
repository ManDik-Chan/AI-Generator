import streamlit as st
import os
from utils import generate_script, verify_api_key, generate_xiaohongshu_content
import streamlit.components.v1 as components
from langchain.chains import ConversationChain
from langchain_openai import ChatOpenAI
from langchain.memory import ConversationSummaryMemory

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

def create_copy_button(text: str, button_text: str = "📋 复制到剪贴板", key: str = None) -> None:
    """使用 Streamlit 原生组件创建复制按钮，带有状态管理"""
    # 初始化状态
    if f"copy_status_{key}" not in st.session_state:
        st.session_state[f"copy_status_{key}"] = False
        st.session_state[f"copy_time_{key}"] = 0

    import time
    current_time = time.time()

    # 检查是否需要重置状态
    if (st.session_state[f"copy_status_{key}"] and
        current_time - st.session_state[f"copy_time_{key}"] > 1):
        st.session_state[f"copy_status_{key}"] = False

    if st.button(button_text, key=key, use_container_width=True):
        try:
            import pyperclip
            pyperclip.copy(text)
            st.session_state[f"copy_status_{key}"] = True
            st.session_state[f"copy_time_{key}"] = current_time
            st.rerun()
        except ImportError:
            st.error('请先安装 pyperclip: pip install pyperclip')

    # 显示复制成功提示
    if st.session_state[f"copy_status_{key}"]:
        st.success('✅ 已复制到剪贴板！', icon="✅")

st.title("📝 AI生成小工具")

# 初始化 session state
if 'api_keys' not in st.session_state:
    st.session_state.api_keys = {
        'qwen': '',
        'chatgpt': '',
        'claude': '',
        'glm': ''
    }
if 'use_env_qwen_key' not in st.session_state:
    st.session_state.use_env_qwen_key = False
if 'use_env_glm_key' not in st.session_state:
    st.session_state.use_env_glm_key = False

# 从系统环境变量中加载 API 密钥
dashscope_api_key = os.getenv('DASHSCOPE_API_KEY')
glm_api_key = os.getenv('GLM_API_KEY')

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

    st.markdown("---")
    st.subheader("🔑 API密钥配置")

    model_key = model_info[model_type]['key']
    key_label = model_info[model_type]['api_label']
    key_url = model_info[model_type]['api_url']

    # 预存密钥相关按钮
    if model_key in ["qwen", "glm"]:
        col1, col2 = st.columns(2)
        with col1:
            env_key = 'DASHSCOPE_API_KEY' if model_key == 'qwen' else 'GLM_API_KEY'
            stored_key = dashscope_api_key if model_key == 'qwen' else glm_api_key
            use_env_key = st.session_state.get(f'use_env_{model_key}_key', False)

            if st.button("📂 加载预存密钥",
                        key=f"use_env_{model_key}_key_btn",
                        disabled=use_env_key):
                if stored_key:
                    st.session_state.api_keys[model_key] = stored_key
                    st.session_state[f'use_env_{model_key}_key'] = True
                    st.warning('请确保点击"验证密钥"和"保存密钥"按钮以完成配置。')
                    st.experimental_rerun()
                else:
                    st.error(f"⚠️ 未找到系统环境变量 {env_key}")

        with col2:
            if st.button("❌ 取消使用预存密钥",
                        key=f"cancel_env_{model_key}_key_btn",
                        disabled=not use_env_key):
                st.session_state[f'use_env_{model_key}_key'] = False
                st.session_state.api_keys[model_key] = ""
                st.session_state[f"{model_key}_verified"] = False
                st.experimental_rerun()

    if ((model_key == 'qwen' and st.session_state.use_env_qwen_key) or
        (model_key == 'glm' and st.session_state.use_env_glm_key)):
        api_key_display = st.empty()
        api_key_display.text_input(key_label, value="预存的API密钥已加载", disabled=True)
        api_key = dashscope_api_key if model_key == 'qwen' else glm_api_key
        st.warning('请确保点击"验证密钥"和"保存密钥"按钮以完成配置。')
    else:
        api_key = st.text_input(
            key_label,
            type="password",
            value=st.session_state.api_keys.get(model_key, ''),
            key=f"{model_key}_key"
        )
        st.markdown(f"[获取{model_type}密钥]({key_url})")

    col1, col2 = st.columns(2)

    if col1.button("🔍 验证密钥", key="verify_btn", disabled=not api_key):
        if not api_key:
            st.error("⚠️ 请输入密钥！")
        else:
            with st.spinner("正在验证密钥..."):
                try:
                    is_valid, message = verify_api_key(model_key, api_key)
                    if is_valid:
                        st.success(f"✅ {message}")
                        st.session_state.api_keys[model_key] = api_key
                        st.session_state[f"{model_key}_verified"] = True
                    else:
                        st.error(f"❌ {message}")
                        st.session_state[f"{model_key}_verified"] = False
                except Exception as e:
                    st.error(f"❌ 验证过程出错: {str(e)}")
                    st.session_state[f"{model_key}_verified"] = False

    if col2.button("💾 保存密钥", key="save_btn", disabled=not api_key):
        if not api_key:
            st.error("⚠️ 请输入密钥！")
        elif not st.session_state.get(f"{model_key}_verified", False):
            st.error("⚠️ 请先验证密钥！")
        else:
            st.session_state.api_keys[model_key] = api_key
            st.success("✅ 密钥已保存！")

# 主界面内容生成部分
tab1, tab2 = st.tabs(["📹 视频脚本", "📱 小红书文案"])

# 视频脚本生成标签页
with tab1:
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

        # 复制功能
        full_script = f"标题：{st.session_state['generated_title']}\n\n{st.session_state['generated_script']}"
        create_copy_button(full_script, "📋 复制脚本到剪贴板", "copy_script_btn")

# 小红书文案生成标签页
with tab2:
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

        # 复制功能
        full_content = f"{selected_title}\n\n{result['content']}\n\n{' '.join([f'#{tag}' for tag in tags])}"
        create_copy_button(full_content, "📋 复制文案到剪贴板", "copy_xiaohongshu_btn")