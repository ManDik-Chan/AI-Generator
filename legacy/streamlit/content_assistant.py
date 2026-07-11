import streamlit as st
from utils import (
    generate_script,
    generate_xiaohongshu_content,
    create_copy_button
)


def render_script_generator():
    """Render video script generator interface"""
    st.subheader("💡 视频脚本生成")

    col1, col2, col3 = st.columns(3)

    with col1:
        subject = st.text_input(
            "📝 视频主题",
            key="subject_input",
            placeholder="例如：如何提高工作效率"
        )

    with col2:
        video_length = st.number_input(
            "⌛ 视频时长(分钟)",
            min_value=0.1,
            max_value=30.0,
            value=3.0,
            step=0.1,
            key="length_input"
        )

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

    # Get current model information
    current_model = st.session_state.get('current_model_type')
    is_key_verified = st.session_state.get(f"{current_model}_verified", False)

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

        with st.spinner(f"🎯 正在生成脚本，请稍后..."):
            try:
                title, script = generate_script(
                    subject=subject,
                    video_length=video_length,
                    creativity=temperature,
                    model_type=current_model,
                    api_key=st.session_state.api_keys[current_model],
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

        # Copy functionality
        full_script = f"标题：{st.session_state['generated_title']}\n\n{st.session_state['generated_script']}"
        create_copy_button(
            text=full_script,
            button_text="📋 复制脚本到剪贴板",
            key=f"copy_script_{hash(full_script)}"
        )


def render_xiaohongshu_generator():
    """Render Xiaohongshu content generator interface"""
    st.subheader("💡 小红书文案生成")

    theme = st.text_input(
        "📝 文案主题",
        key="xiaohongshu_theme",
        placeholder="例如：探店/美食/旅游/穿搭分享"
    )

    temperature = st.slider(
        "🎨 文案创意度",
        min_value=0.0,
        max_value=1.0,
        value=0.7,
        step=0.1,
        help="调节生成文案的创意度：数值越低，生成的内容越严谨；数值越高，生成的内容越有创意",
        key="xiaohongshu_temperature_slider"
    )

    current_model = st.session_state.get('current_model_type')
    is_key_verified = st.session_state.get(f"{current_model}_verified", False)

    # Initialize session state
    if 'selected_title_index' not in st.session_state:
        st.session_state.selected_title_index = 0

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

        with st.spinner(f"🎯 正在生成小红书文案，请稍后..."):
            try:
                result = generate_xiaohongshu_content(
                    theme=theme,
                    model_type=current_model,
                    api_key=st.session_state.api_keys[current_model],
                    temperature=temperature
                )

                st.success("✅ 小红书文案已生成！")
                st.session_state.xiaohongshu_result = result
                st.session_state.selected_title_index = 0

            except Exception as e:
                st.error(f"❌ 生成失败：{str(e)}")
                st.info("💡 请检查API密钥是否正确，或稍后重试")

    if 'xiaohongshu_result' in st.session_state:
        st.markdown("---")
        st.header("🎯 生成结果")

        result = st.session_state['xiaohongshu_result']

        st.subheader("📌 选择标题")
        titles = result['titles']

        cols = st.columns(5)
        for i, title in enumerate(titles):
            with cols[i]:
                if st.button(
                        f"标题 {i + 1}",
                        key=f"title_btn_{i}",
                        help=title,
                        use_container_width=True,
                        type="secondary" if i != st.session_state.get('selected_title_index', 0) else "primary"
                ):
                    st.session_state.selected_title_index = i
                st.caption(title)

        selected_title = titles[st.session_state.get('selected_title_index', 0)]
        st.info(f"已选择: {selected_title}")

        st.subheader("📝 文案内容")
        st.write(result['content'])

        st.subheader("#️⃣ 推荐标签")
        tags = result['tags']
        st.write(' '.join([f"#{tag}" for tag in tags]))

        full_content = f"{selected_title}\n\n{result['content']}\n\n{' '.join([f'#{tag}' for tag in tags])}"

        st.markdown("### 一键复制")
        create_copy_button(
            text=full_content,
            button_text="📋 复制文案到剪贴板",
            key=f"copy_xiaohongshu_{hash(full_content)}"
        )


def render_content_assistant():
    """Render AI Writing Assistant main interface"""
    st.header("✍️ AI写作助手")

    tabs = st.tabs(["📹 视频脚本", "📱 小红书文案"])

    with tabs[0]:
        render_script_generator()

    with tabs[1]:
        render_xiaohongshu_generator()