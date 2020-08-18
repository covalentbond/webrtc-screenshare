import React, { useRef, useEffect } from "react";
import io from "socket.io-client";
// "proxy": "http://localhost:8000",
// "proxy": "https://webrtc-server-side.herokuapp.com/",

const Room = (props) => {
  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef();
  const socketRef = useRef();
  const otherUser = useRef();
  const userStream = useRef();
  const senders = useRef([]);

  //It will ask the user to allow all the things, after allowing this will run
  useEffect(() => {
    function callUser(userID) {
      peerRef.current = createPeer(userID);
      userStream.current //One track for audio, one for video
        .getTracks() //taking our stream & attaching it to our user
        .forEach((track) =>
          senders.current.push(peerRef.current.addTrack(track, userStream.current))
        );
    }
    function handleRecieveCall(incoming) {
      //Now we are not the initiator, we are reciever: so no passing of userID
      peerRef.current = createPeer();
      const desc = new RTCSessionDescription(incoming.sdp);
      peerRef.current
        .setRemoteDescription(desc)
        .then(() => {
          userStream.current
            .getTracks()
            .forEach((track) => peerRef.current.addTrack(track, userStream.current));
        })
        .then(() => {
          return peerRef.current.createAnswer();
        })
        .then((answer) => {
          return peerRef.current.setLocalDescription(answer);
        })
        .then(() => {
          const payload = {
            target: incoming.caller,
            caller: socketRef.current.id,
            sdp: peerRef.current.localDescription
          };
          socketRef.current.emit("answer", payload);
        });
    }

    //userID is that whom we are calling
    function createPeer(userID) {
      const peer = new RTCPeerConnection({
        //If there exists some firewall/by-pass
        iceServers: [
          {
            urls: "stun:stun.stunprotocol.org"
          },
          {
            urls: "turn:numb.viagenie.ca",
            credential: "muazkh",
            username: "webrtc@live.com"
          }
        ]
      });

      peer.onicecandidate = handleICECandidateEvent;
      peer.ontrack = handleTrackEvent;
      peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

      return peer;
    }

    //offer is created here
    function handleNegotiationNeededEvent(userID) {
      peerRef.current
        .createOffer()
        .then((offer) => {
          //whenever recieving an offer setting the offer to our local description

          return peerRef.current.setLocalDescription(offer);
        })
        .then(() => {
          const payload = {
            target: userID,
            caller: socketRef.current.id,
            sdp: peerRef.current.localDescription
          };
          socketRef.current.emit("offer", payload);
        })
        .catch((e) => console.log(e));
    }

    //When recieving an answer from userA
    //Send an offer out to the person A
    //then person A took the answer/OFFER & set it as the remote desc
    //then create the answer & then userB set it as their local desc
    function handleAnswer(message) {
      const desc = new RTCSessionDescription(message.sdp);
      peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
    }

    function handleICECandidateEvent(e) {
      if (e.candidate) {
        const payload = {
          target: otherUser.current,
          candidate: e.candidate
        };
        socketRef.current.emit("ice-candidate", payload);
      }
    }

    function handleNewICECandidateMsg(incoming) {
      const candidate = new RTCIceCandidate(incoming);

      peerRef.current.addIceCandidate(candidate).catch((e) => console.log(e));
    }

    function handleTrackEvent(e) {
      partnerVideo.current.srcObject = e.streams[0];
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        // Allow us to see the actual video of ourselves

        userVideo.current.srcObject = stream;
        userStream.current = stream;

        socketRef.current = io.connect("/");
        socketRef.current.emit("join room", props.match.params.roomID);

        //This will run for only userB
        socketRef.current.on("other user", (userID) => {
          callUser(userID);
          otherUser.current = userID;
        });

        //This will run for only userA
        socketRef.current.on("user joined", (userID) => {
          otherUser.current = userID;
        });

        socketRef.current.on("user disconnected", (userID) => {
          otherUser.current = userID;
          otherUser.current.close();
        });

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
      });
  }, []);

  function shareScreen() {
    navigator.mediaDevices.getDisplayMedia({ cursor: true }).then((stream) => {
      const screenTrack = stream.getTracks()[0];
      console.log(stream.getTracks());
      senders.current
        .find((sender) => sender.track.kind === "video")
        .replaceTrack(screenTrack);
      screenTrack.onended = function () {
        senders.current
          .find((sender) => sender.track.kind === "video")
          .replaceTrack(userStream.current.getTracks()[1]);
      };
    });
  }

  return (
    <div>
      <video
        controls
        muted
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={userVideo}
      />
      <video
        controls
        style={{ height: 500, width: 500 }}
        autoPlay
        ref={partnerVideo}
      />
      <button onClick={shareScreen}>Share screen</button>
    </div>
  );
};

export default Room;
