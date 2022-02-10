import User from "../../models/user";
import Chats from "../../models/chats";
import { createPrivateRoom, rooms } from "../room_manager";
import { IChat, IPhotoMessage, ISocketClient, ITextMessage, IUser, IWebSocket } from "../../lib/interfaces";
import { users } from "../socket";
import { ObjectId } from "mongodb";
import { findOutTUofChat } from "./users";
import e from "express";

export async function check_username_existly(ws: IWebSocket, parsedData: any) {
    const username = parsedData.username;
    if (username && username.length > 0) {
        const chat = await Chats.findOne({
            username: username,
        });
        const user = await User.findOne({
            username: username,
        });
        if (chat || user) {
            ws.send(
                JSON.stringify({
                    message: "chat exists",
                    username: username,
                })
            );
        } else {
            ws.send(
                JSON.stringify({
                    message: "chat not exists",
                    username: username,
                })
            );
        }
    }
}

export async function pushChatToUserChatsList(username: String, chat_id: string) {
    await User.updateOne(
        {
            username: username,
        },
        {
            $push: {
                chats: {
                    chat_id: chat_id, // the id of chat [chats collection]
                },
            },
        }
    );
}

export async function broadCastToAllMembers(chat_id: string, members: Array<any>, data_to_send: object, username: string) {
    await members.forEach(async (member_username, member_index) => {
        if (member_username != username) {
            const member_ws = await users.find(({ username }) => username === member_username);
            if (member_ws) {
                // if user was online
                member_ws.ws.send(JSON.stringify(data_to_send));
            }
        }
    });
}

export async function send_text_message(ws: IWebSocket, parsedData: any) {
    const chat_id = parsedData.chat_id;
    const chat_type = parsedData.chat_type;
    const message_text = parsedData.send_text_message_input;
    const target_username = parsedData.target_username;

    if (message_text && message_text.trim() != "" && chat_id && chat_id.trim() != "" && chat_type && chat_type.length > 0) {
        const message: ITextMessage = {
            message_id: "",
            sender_username: ws.user.username,
            message_type: "text",
            send_time: Date.now(),
            content: message_text,
            edited: false,
        };
        if (chat_type == "private") {
            message.seen_state = "sended";
        }

        handle_messages_socket(chat_id, chat_type, target_username, ws, message);
    }
}

export async function handle_messages_socket(chat_id: string, chat_type: string, target_username: string, ws: IWebSocket, message: ITextMessage | IPhotoMessage) {
    const message_id = new ObjectId().toString();
    message.message_id = message_id;

    async function pushMessage(message: ITextMessage | IPhotoMessage, response: object) {
        await Chats.findOneAndUpdate(
            { _id: chat_id },
            {
                $push: {
                    messages_list: message,
                },
            }
        );

        ws.send(JSON.stringify(response));
    }

    if (chat_type == "private") {
        if (target_username && target_username.length > 0 && target_username != ws.user.username) {
            var target_ws: ISocketClient | undefined;
            let chat: IChat = await Chats.findOne({
                $or: [{ sides: { user_1: ws.user.username, user_2: target_username } }, { sides: { user_1: target_username, user_2: ws.user.username } }],
            });

            function setTargetWs() {
                target_ws = users.find(({ username: _username_ }) => _username_ === target_username);
            }

            if (chat) {
                await setTargetWs();

                if (!target_ws || String(target_ws).trim() == "") {
                    target_ws = undefined;
                    console.log("E :: target_ws not found");
                }
            }

            if (chat) {
                const room = rooms[chat_id];
                if (room) {
                    if (target_ws) {
                        broadCastToOtherSide(target_ws, chat.chat_type, false);
                    } else {
                        console.error("B :: cannot find target_ws");
                    }
                } else {
                    if (chat._id && target_username) {
                        createPrivateRoom(chat._id, ws.user.username, target_username).then((room) => {
                            if (target_ws) {
                                broadCastToOtherSide(target_ws, chat.chat_type, true);
                            } else {
                                console.error("C :: cannot find target_ws");
                            }
                        });
                    } else {
                        console.error("chat._id or target_username or target_ws is empty");
                    }
                }
                pushMessage(message, {
                    event: "send_text_message",
                    chat_id: chat_id,
                    message: "message sended",
                    message_callback: message,
                });
            } else {
                await setTargetWs();

                // we must create a new private_chat
                const user = await User.findOne({
                    username: target_username,
                });
                if (user) {
                    var new_chat = new Chats({
                        chat_type: "private",
                        messages_list: message,
                        sides: {
                            user_1: ws.user.username,
                            user_2: target_username,
                        },
                    });
                    await new_chat.save();
                    // Add this chat into user_1 and user_2 chats_list

                    pushChatToUserChatsList(ws.user.username, new_chat._id);
                    pushChatToUserChatsList(target_username, new_chat._id);

                    // to the sender
                    pushMessage(message, {
                        chat_created: {
                            chat_id: new_chat._id,
                            sides: {
                                user_1: ws.user.username,
                                user_2: target_username,
                            },
                        },
                        event: "send_text_message",
                        chat_id: new_chat._id,
                        message: "message sended",
                        message_callback: message,
                        chat_type: "private",
                        target_username: target_username,
                    });

                    // to the receiver
                    createPrivateRoom(new_chat._id, ws.user.username, target_username).then(() => {
                        if (target_ws) {
                            let data_to_send: any = {
                                __chat_created: {
                                    chat_id: new_chat._id,
                                    sides: {
                                        user_1: ws.user.username,
                                        user_2: target_username,
                                    },
                                    messages: [message],
                                    full_name: ws.user.full_name,
                                    username: ws.user.username,
                                },
                                event: "chat_created_from_a_user",
                                chat_id: new_chat._id,
                                chat_type: "private",
                            };
                            if (user.profile_photos.length > 0) {
                                data_to_send["profile_photo"] = user.profile_photos[0];
                            }
                            target_ws.ws.send(JSON.stringify(data_to_send));
                        } else {
                            console.log("D :: target_ws not found");
                        }
                    });
                }
            }

            async function broadCastToOtherSide(target_ws: ISocketClient | undefined, chat_type: string, chat_created: boolean) {
                if (target_ws) {
                    const new_chat: any = {
                        username: target_ws.ws.user.username,
                        full_name: target_ws.ws.user.full_name,
                        sides: {
                            user_1: ws.user.username,
                            user_2: target_ws.ws.user.username,
                        },
                        target_username: target_username,
                    };
                    if (ws.user.profile_photos.length > 0) {
                        new_chat["profile_photo"] = ws.user.profile_photos[0];
                    }
                    let data_to_send: any = {
                        event: "you_have_new_message",
                        message: message,
                        chat_id: chat_id,
                    };
                    if (chat_created) {
                        // our method cannot know that when should will send the `new_chat`
                        data_to_send["chat_type"] = chat_type;
                        data_to_send["new_chat"] = new_chat;
                    }
                    target_ws.ws.send(JSON.stringify(data_to_send));
                } else {
                    console.log("E :: target_ws not found");
                }
            }
        }
    } else if (chat_type == "channel") {
        const channel = await Chats.findOne({
            _id: chat_id,
        });

        // SECTION - checking user permissions
        if (channel) {
            if (channel.members && channel.members.length > 0) {
                var user_is_aadmin = channel.members.includes(ws.user.username);
            }
            if (channel.creator_username == ws.user.username || user_is_aadmin) {
                let data_to_send: any = {
                    event: "you_have_new_message",
                    message: message,
                    chat_id: chat_id,
                };

                broadCastToAllMembers(chat_id, channel.members, data_to_send, ws.user.username);
            } else {
                console.log(`${chat_id} channel not found`);
            }
            pushMessage(message, {
                event: "send_text_message",
                message: "message sended",
                chat_id: chat_id,
                message_callback: message,
            });
        }
    } else if (chat_type == "group") {
        const group: IChat = await Chats.findOne({
            _id: chat_id,
        });
        if (group) {
            // we check that the user is a member of the group
            let userIsMember;
            if (group.members && group.members.length > 0) {
                userIsMember = group.members.includes(ws.user.username);
            }
            if (userIsMember || group.creator_username == ws.user.username) {
                let data_to_send: any = {
                    event: "you_have_new_message",
                    message: message,
                    chat_id: chat_id,
                };

                if (group.members && group.members.length > 0) {
                    broadCastToAllMembers(chat_id, group.members, data_to_send, ws.user.username);
                }
                if (ws.user.username != group.creator_username) {
                    // broadcast message to creator -> because name of creator is not in the members list
                    const creator_ws = await users.find(({ username: _username_ }) => _username_ === group.creator_username);
                    if (creator_ws) {
                        creator_ws.ws.send(JSON.stringify(data_to_send));
                    }
                }

                pushMessage(message, {
                    event: "send_text_message",
                    chat_id: chat_id,
                    message: "message sended",
                    message_callback: message,
                });
            }
        } else {
            console.log(`${chat_id} group not found`);
        }
    }
}

export async function join_to_chat(ws: IWebSocket, parsedData: any) {
    const chat_id = parsedData.chat_id;
    const chat: IChat = await Chats.findById(chat_id);
    if (chat) {
        if (chat.chat_type != "private" && chat.members) {
            const st = chat.members.includes(ws.user.username);
            if (!st && chat.creator_username != ws.user.username) {
                const user_have_chat = ws.user.chats.find(({ chat_id: _chat_id_ }) => _chat_id_ === chat_id);
                if (!user_have_chat) {
                    pushChatToUserChatsList(ws.user.username, chat_id);
                }
                await Chats.findOneAndUpdate(
                    { _id: chat_id },
                    {
                        $push: {
                            members: [ws.user.username],
                        },
                    }
                );
                ws.send(
                    JSON.stringify({
                        event: "you_joined_into_a_chat",
                        chat_id: chat_id,
                    })
                );
            } else {
                console.log("the user is currently a member of this channel");
            }
        }
    }
}

export async function get_chat_messages(ws: IWebSocket, parsedData: any) {
    const chat_id = parsedData.chat_id;
    if (chat_id && chat_id.length > 0) {
        const chat = await Chats.findById(chat_id);
        if (chat && chat.chat_type != "private") {
            ws.send(
                JSON.stringify({
                    event: "get_chat_messages",
                    chat_id: chat_id,
                    messages_list: chat.messages_list,
                })
            );
        }
    }
}

export async function delete_message(ws: IWebSocket, parsedData: any) {
    const chat_id = parsedData.chat_id;
    const _message_id = parsedData.message_id;
    if (chat_id && chat_id.length > 0 && _message_id && _message_id.length > 0) {
        const chat: IChat = await Chats.findById(chat_id);
        if (chat) {
            const messages: Array<any> = chat.messages_list;
            const message_id_exists = messages.find(({ message_id }) => message_id === _message_id);

            if (message_id_exists) {
                async function do_delete_message() {
                    await Chats.updateOne(
                        { _id: chat_id },
                        {
                            $pull: {
                                messages_list: {
                                    message_id: _message_id,
                                },
                            },
                        }
                    );
                    ws.send(
                        JSON.stringify({
                            message: "message deleted",
                            chat_id: chat_id,
                            message_id: _message_id,
                        })
                    );
                }
                // Checking user permissions to this chat
                if (chat.chat_type == "private") {
                    // both users can delete any message of their chat
                    do_delete_message();
                    const target_username = findOutTUofChat(chat, ws.user.username);
                    const target_ws = users.find(({ username: _username_ }) => _username_ === target_username);
                    if (target_ws) {
                        target_ws.ws.send(
                            JSON.stringify({
                                message: "message deleted",
                                chat_id: chat_id,
                                message_id: _message_id,
                            })
                        );
                    }
                } else {
                    let user_is_aadmin;
                    if (chat.admins && chat.admins.length > 0) {
                        user_is_aadmin = chat.admins.includes(ws.user.username);
                    }
                    if (chat.creator_username == ws.user.username || user_is_aadmin) {
                        do_delete_message();
                        await Chats.updateOne(
                            { _id: chat_id },
                            {
                                $pull: {
                                    messages_list: {
                                        message_id: _message_id,
                                    },
                                },
                            }
                        );

                        if (chat.members && chat.members.length > 0) {
                            broadCastToAllMembers(
                                chat_id,
                                chat.members,
                                {
                                    message: "message deleted",
                                    chat_id: chat_id,
                                    message_id: _message_id,
                                },
                                ws.user.username
                            );
                        }
                    }
                }
            }
        }
    }
}

export async function getUserFullInfo(ws: IWebSocket, parsedData: any) {
    const chat_id = parsedData.chat_id;
    if (chat_id && chat_id.length > 0) {
        const chat: IChat = await Chats.findOne({
            _id: chat_id,
        });
        if (chat) {
            if (chat.chat_type != "private") {
                const profile_photos = chat.profile_photos.reverse();
                var user_info_to_send: any = {
                    event: "get_chat_full_info",
                    user_info: {
                        full_name: chat.full_name,
                        username: chat.username,
                        bio: chat.bio,
                        profile_photos: profile_photos,
                    },
                };
            } else {
                const target_username = findOutTUofChat(chat, ws.user.username);
                if (target_username) {
                    const user: IUser = await User.findOne({ username: target_username });
                    const profile_photos = user.profile_photos.reverse();
                    var user_info_to_send: any = {
                        event: "get_chat_full_info",
                        user_info: {
                            full_name: user.full_name,
                            username: user.username,
                            bio: user.bio,
                            profile_photos: profile_photos,
                            last_seen: user.last_seen,
                        },
                    };
                }
            }

            if (user_info_to_send) {
                function collect_members() {
                    return new Promise(async (resolve) => {
                        const creator_info = {
                            full_name: ws.user.full_name,
                            username: ws.user.username,
                            profile_photos: ws.user.profile_photos,
                            position: "creator",
                            last_seen: ws.user.last_seen,
                        };
                        if (
                            (chat.chat_type == "group" ||
                                (chat.chat_type == "channel" && (chat.creator_username == ws.user.username || chat.admins?.includes(ws.user.username)))) &&
                            chat.members &&
                            chat.members.length > 0
                        ) {
                            let members_list: any = [];
                            await chat.members.forEach(async (member_username, index) => {
                                if (chat.members?.length) {
                                    const user: IUser = await User.findOne({
                                        username: member_username,
                                    });
                                    if (user) {
                                        members_list.push({
                                            full_name: user.full_name,
                                            username: user.username,
                                            profile_photos: user.profile_photos.reverse(),
                                            bio: user.bio,
                                            last_seen: user.last_seen,
                                        });
                                    }
                                    if (index == chat.members.length - 1) {
                                        if (chat.chat_type != "private") {
                                            members_list.push(creator_info);
                                        }
                                        resolve(members_list);
                                    }
                                }
                            });
                        } else {
                            if (chat.chat_type != "private") {
                                resolve([creator_info]);
                            } else {
                                resolve([]);
                            }
                        }
                    });
                }

                await collect_members().then((data) => {
                    if (data) {
                        user_info_to_send.user_info.members = data;
                    }
                });

                ws.send(JSON.stringify(user_info_to_send));
            }
        }
    }
}

// TODO
export async function user_seened_message(ws: IWebSocket, parsedData: any) {}
