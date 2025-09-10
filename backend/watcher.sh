#!/bin/bash
DIR="$( cd -P "$( dirname "$0" )" && pwd )"
cd "$DIR"

while true
do
numproc=`ps x | grep -ai main.py | grep -v "grep" | wc -l`
if [ $numproc -lt 1 ]
then
./start.sh 
sleep 100
fi

sleep 15
done