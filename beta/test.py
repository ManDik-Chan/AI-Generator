import streamlit as st
from langchain.memory import ConversationBufferMemory

from utils import get_chat_response

st.title("🗨 AI聊天助手")

if "memory" not in st.session_state:
    st.session_state["memory"] = ConversationBufferMemory(return_messages=Ture)
    st.session_state["message"] = [{"role": "ai",
                                    "content": "你好，我是你的AI助手，有什么可以帮你的吗？"}]

for message in st.session_state["message"]:
    st.chat_message(message["role"]).write(message["content"])